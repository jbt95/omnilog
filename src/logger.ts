/**
 * Main logger implementation with context propagation and event emission
 * @module logger
 */

import { z } from 'zod';
import type {
  ContextEnricher,
  ContextManager,
  Envelope,
  EventByName,
  EventDefAny,
  Policy,
  PiiFinding,
  Registry,
  Sink,
  TraceContext,
  TracingOptions,
} from './types.js';
import { CreateContext } from './context.js';
import { ApplyRedaction } from './redaction.js';
import { DetectPii } from './pii-guard.js';

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
  /** Context enrichers applied at emit time */
  enrichers?: readonly ContextEnricher<Context>[];
  /** Tracing integration */
  tracing?: TracingOptions<Context>;
  /** Internal shared runtime */
  runtime?: LoggerRuntimeState;
};

export type LoggerRuntimeState = {
  now?: () => number;
  random?: () => number;
  rateLimitBuckets?: Map<string, { tokens: number; lastRefillMs: number }>;
  deprecationWarnings?: Set<string>;
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
  const enrichers = options.enrichers ?? [];
  const tracing = options.tracing;
  const runtimeNow = options.runtime?.now ?? Date.now;
  const runtimeRandom = options.runtime?.random ?? Math.random;
  const rateLimitBuckets = options.runtime?.rateLimitBuckets ?? new Map();
  const deprecationWarnings = options.runtime?.deprecationWarnings ?? new Set<string>();

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

  function WarnDeprecation(event: EventDefAny): void {
    if (!event.deprecated) return;
    if (deprecationWarnings.has(event.name)) return;
    deprecationWarnings.add(event.name);
    console.warn(
      `Event "${event.name}" is deprecated${
        event.deprecationMessage ? `: ${event.deprecationMessage}` : ''
      }`,
    );
  }

  function ParseTraceParent(traceparent: string): TraceContext | undefined {
    const match = traceparent
      .trim()
      .match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
    if (!match) return undefined;
    const traceId = match[2];
    const spanId = match[3];
    const traceFlags = match[4];
    if (!traceId || !spanId || !traceFlags) return undefined;
    return {
      traceId: traceId.toLowerCase(),
      spanId: spanId.toLowerCase(),
      traceFlags: traceFlags.toLowerCase(),
      traceparent,
    };
  }

  function ResolveTraceContext(context: Partial<Context>): TraceContext | undefined {
    const configuredTraceContext = tracing?.GetTraceContext?.();
    if (configuredTraceContext) return configuredTraceContext;

    const contextRecord = context as Record<string, unknown>;
    const contextTraceParent =
      typeof contextRecord.traceparent === 'string' ? contextRecord.traceparent : undefined;
    const parsedTraceParent = contextTraceParent ? ParseTraceParent(contextTraceParent) : undefined;

    const traceId =
      typeof contextRecord.traceId === 'string'
        ? contextRecord.traceId
        : parsedTraceParent?.traceId;
    const spanId =
      typeof contextRecord.spanId === 'string' ? contextRecord.spanId : parsedTraceParent?.spanId;
    const traceFlags =
      typeof contextRecord.traceFlags === 'string'
        ? contextRecord.traceFlags
        : parsedTraceParent?.traceFlags;

    if (!traceId && !spanId && !traceFlags && !contextTraceParent) {
      return undefined;
    }

    return {
      ...(traceId ? { traceId } : {}),
      ...(spanId ? { spanId } : {}),
      ...(traceFlags ? { traceFlags } : {}),
      ...(contextTraceParent ? { traceparent: contextTraceParent } : {}),
    };
  }

  function ApplyTracingContext(context: Partial<Context>): Partial<Context> {
    if (!tracing?.injectTraceContext) return context;
    const traceContext = ResolveTraceContext(context);
    if (!traceContext) return context;

    const mappedTraceContext = tracing.MapTraceContext
      ? tracing.MapTraceContext(traceContext)
      : (traceContext as Partial<Context>);

    return { ...context, ...mappedTraceContext };
  }

  function ApplyEnrichers(
    event: EventDefAny,
    context: Partial<Context>,
    payload: unknown,
    ts: string,
  ): Partial<Context> {
    if (enrichers.length === 0) return context;

    let enrichedContext = { ...context };

    for (const enricher of enrichers) {
      try {
        const fragment = enricher({
          name: event.name,
          kind: event.kind,
          ts,
          context: enrichedContext,
          payload,
          ...(event.level !== undefined ? { level: event.level } : {}),
        });

        if (!fragment) continue;
        enrichedContext = { ...enrichedContext, ...fragment };
      } catch (error) {
        console.error('Context enricher error:', error);
      }
    }

    return enrichedContext;
  }

  function ResolveSamplingRate(event: EventDefAny, context: Context, payload: unknown): number {
    const sampleConfig = policy?.sample;
    if (!sampleConfig) return 1;

    let resolvedRate = sampleConfig.rate ?? 1;

    if (sampleConfig.rules) {
      for (const rule of sampleConfig.rules) {
        if (rule.event && rule.event !== event.name) continue;
        if (rule.kind && rule.kind !== event.kind) continue;
        if (rule.level && rule.level !== event.level) continue;
        if (
          rule.when &&
          !rule.when({
            event: event.name,
            kind: event.kind,
            context: context as unknown as Record<string, unknown>,
            payload,
            ...(event.level !== undefined ? { level: event.level } : {}),
          })
        ) {
          continue;
        }

        resolvedRate = rule.rate;
        break;
      }
    }

    if (sampleConfig.adaptive && (event.level === 'error' || event.level === 'fatal')) {
      resolvedRate = 1;
    }

    return Math.max(0, Math.min(1, resolvedRate));
  }

  function ShouldSample(event: EventDefAny, context: Context, payload: unknown): boolean {
    const rate = ResolveSamplingRate(event, context, payload);
    if (rate >= 1) return true;
    if (rate <= 0) return false;
    return runtimeRandom() <= rate;
  }

  function ShouldEmitWithinRateLimit(eventName: string): boolean {
    const rateLimitConfig = policy?.rateLimit;
    if (!rateLimitConfig) return true;

    const rule = rateLimitConfig.rules.find((candidate) => candidate.event === eventName);
    if (!rule) return true;

    const burst = Math.max(1, rule.burst);
    const refillRate = Math.max(0, rule.perSecond);
    const nowMs = runtimeNow();
    const existingBucket = rateLimitBuckets.get(eventName) ?? {
      tokens: burst,
      lastRefillMs: nowMs,
    };
    const elapsedSeconds = Math.max(0, (nowMs - existingBucket.lastRefillMs) / 1000);
    const refilledTokens = Math.min(burst, existingBucket.tokens + elapsedSeconds * refillRate);
    const nextBucket = {
      tokens: refilledTokens,
      lastRefillMs: nowMs,
    };

    if (nextBucket.tokens >= 1) {
      nextBucket.tokens -= 1;
      rateLimitBuckets.set(eventName, nextBucket);
      return true;
    }

    rateLimitBuckets.set(eventName, nextBucket);

    if (rateLimitConfig.onLimit === 'throw') {
      throw new Error(`Rate limit exceeded for event "${eventName}"`);
    }

    return false;
  }

  function EvaluatePiiGuard(event: EventDefAny, payload: unknown): PiiFinding[] {
    if (!policy?.piiGuard) return [];
    return DetectPii(payload, event.tags, policy.piiGuard);
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

    WarnDeprecation(event);

    const piiFindings = EvaluatePiiGuard(event, payloadResult.data);
    if (piiFindings.length > 0) {
      const piiMessage = `PII guard detected sensitive values for event "${event.name}" at ${piiFindings
        .map((finding) => finding.path)
        .join(', ')}`;
      if (policy?.piiGuard?.mode === 'block') {
        throw new Error(piiMessage);
      }
      console.warn(piiMessage);
    }

    const baseContext = contextManager.Get() ?? ({} as Context);
    const mergedContext = { ...baseContext, ...overrideContext } as Partial<Context>;
    const timestamp = new Date().toISOString();
    const tracedContext = ApplyTracingContext(mergedContext);
    const enrichedContext = ApplyEnrichers(event, tracedContext, payloadResult.data, timestamp);
    const parsedContext = ValidateContext(enrichedContext as Context);
    EnsureRequiredContext(event, parsedContext);

    if (!ShouldEmitWithinRateLimit(event.name)) return null;
    if (!ShouldSample(event, parsedContext, payloadResult.data)) return null;

    const envelope: Envelope<Context, z.output<Event['schema']>> = {
      kind: event.kind,
      name: event.name,
      ts: timestamp,
      schema: {
        fingerprint: event.fingerprint,
        ...(event.version !== undefined ? { version: event.version } : {}),
      },
      context: parsedContext,
      payload: payloadResult.data,
      ...(event.level !== undefined ? { level: event.level } : {}),
      ...(event.tags !== undefined ? { tags: event.tags } : {}),
    };

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
        errors.length > 0 ? { ...(payload as Record<string, unknown>), _errors: errors } : payload;

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
