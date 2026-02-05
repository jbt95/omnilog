/**
 * Main logger implementation with context propagation and event emission
 * @module logger
 */

import { z } from 'zod';
import type {
  ContextManager,
  Envelope,
  EventByName,
  EventDefAny,
  Policy,
  Registry,
  Sink,
} from './types.js';
import { CreateContext } from './context.js';
import { ApplyRedaction } from './redaction.js';

/**
 * Event accumulator for building up context over time
 */
type EventAccumulator<Context> = {
  /** Set context fragment */
  Set: <K extends keyof Context>(fragment: Pick<Context, K>) => EventAccumulator<Context>;
  /** Track an error */
  Error: (err: unknown, meta?: Record<string, unknown>) => EventAccumulator<Context>;
  /** Emit the accumulated event */
  Emit: <Name extends string, Payload>(
    name: Name,
    payload: Payload,
  ) => Envelope<Context, Payload> | null;
};

export type LoggerInstance<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
> = {
  Emit: <Name extends Events[number]['name']>(
    name: Name,
    payload: z.output<EventByName<Events, Name>['schema']>,
    overrideContext?: Partial<z.output<ContextSchema>>,
  ) => Envelope<z.output<ContextSchema>, z.output<EventByName<Events, Name>['schema']>> | null;
  Accumulate: () => EventAccumulator<z.output<ContextSchema>>;
  Run: ContextManager<z.output<ContextSchema>>['Run'];
};

/**
 * Create a typed logger for emitting structured events
 *
 * @param registry - Event registry with all defined events
 * @param options - Logger options (sinks, policy, context)
 * @returns Logger with Emit, Accumulate, and Run methods
 *
 * @example
 * ```typescript
 * const logger = CreateLogger(registry, {
 *   sinks: [CreateEnvironmentSink()],
 *   policy: { redact: ['pii'] },
 * });
 *
 * // Simple emission
 * logger.Emit('user.login', { userId: '123' });
 *
 * // With context
 * await logger.Run({ traceId: 'abc' }, async () => {
 *   logger.Emit('user.login', { userId: '123' });
 * });
 *
 * // Accumulate context over time
 * const acc = logger.Accumulate();
 * acc.Set({ userId: '123' }).Set({ action: 'checkout' });
 * acc.Emit('checkout.completed', { total: 99.99 });
 * ```
 */
export type LoggerOptions<Context> = {
  /** Sinks to send events to */
  sinks?: Sink<Envelope<Context, unknown>>[];
  /** Logging policy */
  policy?: Policy;
  /** Custom context manager */
  context?: ContextManager<Context>;
};

export function CreateLogger<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
>(
  registry: Registry<ContextSchema, Events>,
  options: LoggerOptions<z.output<ContextSchema>> = {},
): LoggerInstance<ContextSchema, Events> {
  type Context = z.output<ContextSchema>;
  type EventName = Events[number]['name'];

  const contextManager = options.context ?? CreateContext(registry.contextSchema);
  const sinks = options.sinks ?? [];
  const policy = options.policy;

  function ValidateContext(context: Context): Context {
    const result = registry.contextSchema.safeParse(context);
    if (!result.success) {
      throw new Error(`Invalid context: ${result.error.message}`);
    }
    return result.data;
  }

  function EnsureRequiredContext(event: EventDefAny, context: Context): void {
    if (!event.require || event.require.length === 0) return;
    for (const key of event.require) {
      if (context[key as keyof Context] === undefined) {
        throw new Error(`Missing required context "${String(key)}" for event ${event.name}`);
      }
    }
  }

  function ShouldSample(): boolean {
    if (!policy?.sample) return true;
    const { rate = 1 } = policy.sample;
    if (rate >= 1) return true;
    if (rate <= 0) return false;
    return Math.random() <= rate;
  }

  function EmitEvent<Event extends Events[number]>(
    event: Event,
    payload: z.output<Event['schema']>,
    overrideContext?: Partial<Context>,
  ): Envelope<Context, z.output<Event['schema']>> | null {
    const payloadResult = event.schema.safeParse(payload);
    if (!payloadResult.success) {
      throw new Error(`Invalid payload for ${event.name}: ${payloadResult.error.message}`);
    }

    const baseContext = contextManager.Get() ?? ({} as Context);
    const mergedContext = { ...baseContext, ...overrideContext } as Context;
    const parsedContext = ValidateContext(mergedContext);
    EnsureRequiredContext(event, parsedContext);

    const envelope: Envelope<Context, z.output<Event['schema']>> = {
      kind: event.kind,
      name: event.name,
      ts: new Date().toISOString(),
      schema: {
        fingerprint: event.fingerprint,
        ...(event.version !== undefined ? { version: event.version } : {}),
      },
      context: parsedContext,
      payload: payloadResult.data,
      ...(event.level !== undefined ? { level: event.level } : {}),
      ...(event.tags !== undefined ? { tags: event.tags } : {}),
    };

    if (!ShouldSample()) return null;

    const redacted = ApplyRedaction(
      envelope as unknown as Record<string, unknown>,
      event.tags,
      policy?.redactionMode ?? 'strict',
      policy?.redact,
    ) as unknown as Envelope<Context, z.output<Event['schema']>>;

    for (const sink of sinks) {
      try {
        const result = sink(redacted);
        void Promise.resolve(result).catch((error) => {
          console.error('Sink error:', error);
        });
      } catch (error) {
        console.error('Sink error:', error);
      }
    }

    return redacted;
  }

  function Emit<Name extends EventName>(
    name: Name,
    payload: z.output<EventByName<Events, Name>['schema']>,
    overrideContext?: Partial<Context>,
  ): Envelope<Context, z.output<EventByName<Events, Name>['schema']>> | null {
    const event = registry.eventsByName[name] as EventByName<Events, Name> | undefined;
    if (!event) throw new Error(`Unknown event: ${String(name)}`);
    return EmitEvent(event, payload, overrideContext);
  }

  function Accumulate(): EventAccumulator<Context> {
    const fragments: Array<{ key: string; value: unknown }> = [];
    const errors: Array<{ error: unknown; meta?: Record<string, unknown> }> = [];

    function Set<K extends keyof Context>(fragment: Pick<Context, K>) {
      for (const [key, value] of Object.entries(fragment)) {
        fragments.push({ key, value });
      }
      return accumulator;
    }

    function TrackError(err: unknown, meta?: Record<string, unknown>) {
      const errorEntry: { error: unknown; meta?: Record<string, unknown> } = { error: err };
      if (meta !== undefined) {
        errorEntry.meta = meta;
      }
      errors.push(errorEntry);
      return accumulator;
    }

    function EmitAccumulated<Name extends EventName, Payload>(
      name: Name,
      payload: Payload,
    ): Envelope<Context, Payload> | null {
      const event = registry.eventsByName[name] as EventByName<Events, Name> | undefined;
      if (!event) throw new Error(`Unknown event: ${String(name)}`);

      const accumulatedContext = fragments.reduce((acc, { key, value }) => {
        (acc as Record<string, unknown>)[key] = value;
        return acc;
      }, {} as Partial<Context>);

      const payloadWithErrors =
        errors.length > 0
          ? { ...(payload as Record<string, unknown>), _errors: errors }
          : payload;

      return EmitEvent(
        event as unknown as Events[number],
        payloadWithErrors as z.output<Events[number]['schema']>,
        accumulatedContext,
      ) as Envelope<Context, Payload> | null;
    }

    const accumulator: EventAccumulator<Context> = {
      Set,
      Error: TrackError,
      Emit: EmitAccumulated,
    };

    return accumulator;
  }

  return {
    Emit,
    Accumulate,
    Run: contextManager.Run,
  };
}
