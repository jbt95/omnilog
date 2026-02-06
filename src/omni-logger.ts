/**
 * Logger factory for singleton and request-scoped usage
 * @module omni-logger
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type {
  Envelope,
  EventByName,
  EventDefAny,
  PolicySimulationResult,
  Registry,
} from './types.js';
import type { LoggerInstance, LoggerOptions, LoggerRuntimeState } from './logger.js';
import { CreateLogger } from './logger.js';
import { CreateDomainError } from './error.js';
import { ApplyRedaction } from './redaction.js';
import { DetectPii } from './pii-guard.js';

export type LoggerFactory<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
> = {
  Singleton: () => LoggerInstance<ContextSchema, Events>;
  Scoped: <Result>(
    context: z.output<ContextSchema>,
    fn: (logger: LoggerInstance<ContextSchema, Events>) => Result | Promise<Result>,
  ) => Result | Promise<Result>;
  Get: () => LoggerInstance<ContextSchema, Events>;
};

export type LoggerSimulationOptions<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
  Name extends Events[number]['name'],
> = {
  registry: Registry<ContextSchema, Events>;
  name: Name;
  payload: z.output<EventByName<Events, Name>['schema']>;
  context: z.output<ContextSchema>;
  policy?: LoggerOptions<z.output<ContextSchema>>['policy'];
};

export class OmniLogger {
  /**
   * Simulate policy behavior for a single event without emitting it.
   *
   * Useful for validating redaction, required context, and PII guard behavior in tests
   * or CI checks.
   */
  static Simulate<
    ContextSchema extends z.ZodObject<z.ZodRawShape>,
    const Events extends readonly EventDefAny[],
    Name extends Events[number]['name'],
  >(
    options: LoggerSimulationOptions<ContextSchema, Events, Name>,
  ): PolicySimulationResult<
    z.output<ContextSchema>,
    z.output<EventByName<Events, Name>['schema']>
  > {
    const { registry, name, payload, context, policy } = options;
    const event = registry.eventsByName[name] as EventByName<Events, Name> | undefined;
    if (!event) {
      throw CreateDomainError(
        'omni-logger',
        'OMNI_LOGGER_UNKNOWN_EVENT',
        `Unknown event: ${String(name)}`,
        {
          details: { eventName: String(name) },
          resolution: 'Define the event in Registry.Create(...) before simulation.',
        },
      );
    }

    const warnings: string[] = [];

    const payloadResult = event.schema.safeParse(payload);
    if (!payloadResult.success) {
      throw CreateDomainError(
        'omni-logger',
        'SIMULATION_INVALID_INPUT',
        `Invalid payload for ${event.name}`,
        {
          reason: payloadResult.error.message,
          details: { eventName: event.name, target: 'payload' },
          resolution: 'Provide a payload matching the event schema.',
        },
      );
    }

    const contextResult = registry.contextSchema.safeParse(context);
    if (!contextResult.success) {
      throw CreateDomainError('omni-logger', 'SIMULATION_INVALID_INPUT', 'Invalid context', {
        reason: contextResult.error.message,
        details: { target: 'context' },
        resolution: 'Provide context that matches the registry context schema.',
      });
    }

    if (event.require && event.require.length > 0) {
      for (const requiredKey of event.require) {
        if (contextResult.data[requiredKey as keyof typeof contextResult.data] === undefined) {
          throw CreateDomainError(
            'omni-logger',
            'SIMULATION_INVALID_INPUT',
            `Missing required context "${String(requiredKey)}" for event ${event.name}`,
            {
              details: { eventName: event.name, key: String(requiredKey), target: 'context' },
              resolution: 'Set all required context fields before simulation.',
            },
          );
        }
      }
    }

    const piiFindings = policy?.piiGuard
      ? DetectPii(payloadResult.data, event.tags, policy.piiGuard)
      : [];
    if (piiFindings.length > 0) {
      warnings.push(
        `PII guard detected sensitive values at ${piiFindings
          .map((finding) => finding.path)
          .join(', ')}`,
      );
      if (policy?.piiGuard?.mode === 'block') {
        return {
          accepted: false,
          warnings,
          piiFindings,
        };
      }
    }

    const envelope: Envelope<
      z.output<ContextSchema>,
      z.output<EventByName<Events, Name>['schema']>
    > = {
      kind: event.kind,
      name: event.name,
      ts: new Date().toISOString(),
      schema: {
        fingerprint: event.fingerprint,
        ...(event.version !== undefined ? { version: event.version } : {}),
      },
      context: contextResult.data,
      payload: payloadResult.data,
      ...(event.level !== undefined ? { level: event.level } : {}),
      ...(event.tags !== undefined ? { tags: event.tags } : {}),
    };

    const redacted = ApplyRedaction(
      envelope as unknown as Record<string, unknown>,
      event.tags,
      policy?.redactionMode ?? 'strict',
      policy?.redact,
    ) as unknown as Envelope<
      z.output<ContextSchema>,
      z.output<EventByName<Events, Name>['schema']>
    >;

    return {
      accepted: true,
      warnings,
      piiFindings,
      envelope,
      redacted,
    };
  }

  /**
   * Create a logger factory from an existing registry.
   *
   * This is the only logger creation entrypoint. Build your registry with
   * `Registry.Create(...)`, then pass it to `OmniLogger.For(...)`.
   *
   * @example
   * ```typescript
   * const registry = Registry.Create(contextSchema, (registry) => [
   *   registry.DefineEvent('user.login', z.object({ id: z.string() }), {
   *     kind: 'log',
   *     require: ['traceId'] as const,
   *   }),
   * ] as const);
   *
   * const loggerFactory = OmniLogger.For(registry, {
   *   sinks: [Sink.Environment()],
   * });
   * ```
   */
  static For<
    ContextSchema extends z.ZodObject<z.ZodRawShape>,
    const Events extends readonly EventDefAny[],
  >(
    registry: Registry<ContextSchema, Events>,
    options: LoggerOptions<z.output<ContextSchema>> = {},
  ): LoggerFactory<ContextSchema, Events> {
    const loggerStore = new AsyncLocalStorage<LoggerInstance<ContextSchema, Events>>();
    let singleton: LoggerInstance<ContextSchema, Events> | undefined;
    const runtimeState: LoggerRuntimeState = {
      ...(options.runtime ?? {}),
      rateLimitBuckets: options.runtime?.rateLimitBuckets ?? new Map(),
      deprecationWarnings: options.runtime?.deprecationWarnings ?? new Set(),
    };
    const loggerOptions: LoggerOptions<z.output<ContextSchema>> = {
      ...options,
      runtime: runtimeState,
    };

    function Singleton(): LoggerInstance<ContextSchema, Events> {
      if (!singleton) {
        singleton = CreateLogger(registry, loggerOptions);
      }
      return singleton;
    }

    function Get(): LoggerInstance<ContextSchema, Events> {
      const logger = loggerStore.getStore();
      if (!logger) {
        throw CreateDomainError(
          'omni-logger',
          'OMNI_LOGGER_NO_SCOPE',
          'No logger available in the current scope',
          {
            resolution: 'Call OmniLogger.For(...).Scoped(...) before using Get().',
          },
        );
      }
      return logger;
    }

    function Scoped<Result>(
      context: z.output<ContextSchema>,
      fn: (logger: LoggerInstance<ContextSchema, Events>) => Result | Promise<Result>,
    ): Result | Promise<Result> {
      const logger = CreateLogger(registry, loggerOptions);
      return loggerStore.run(logger, () => logger.Run(context, () => fn(logger)));
    }

    return {
      Singleton,
      Scoped,
      Get,
    };
  }
}
