import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Context, Registry, Sink, TypedLogger } from '../src/index.js';

describe('Logger', function LoggerSuite() {
  it('redacts tagged fields', async function RedactsTaggedFields() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent(
            'user.signed_in',
            z.object({ email: z.string().email(), ip: z.string() }),
            {
              kind: 'log',
              require: ['traceId'] as const,
              tags: {
                'payload.email': 'pii',
              },
            },
          ),
        ] as const,
    );
    type Context = z.infer<typeof contextSchema>;
    const memory = Sink.Memory<Context>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory],
      policy: { redact: ['pii'] },
    });
    const logger = loggerFactory.Singleton();

    await logger.Run({ traceId: 'trace_1' }, async () => {
      logger.Emit('user.signed_in', {
        email: 'person@example.com',
        ip: '127.0.0.1',
      });
    });

    const payload = memory.events[0]?.payload as { email?: string } | undefined;
    expect(payload?.email).toBe('[REDACTED]');
  });

  it('enforces required context', async function EnforcesRequiredContext() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('order.created', z.object({ id: z.string() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );
    const loggerFactory = TypedLogger.For(registry);
    const logger = loggerFactory.Singleton();

    expect(() => logger.Emit('order.created', { id: 'order_1' })).toThrowError(
      expect.objectContaining({
        code: 'LOGGER_MISSING_REQUIRED_CONTEXT',
        domain: 'logger',
      }),
    );
  });

  it('accumulates context with Accumulate()', async function AccumulatesContextWithAccumulate() {
    const contextSchema = z.object({
      traceId: z.string(),
      userId: z.string().optional(),
      cart: z.any().optional(),
    });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('checkout.completed', z.object({ total: z.number() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );
    const memory = Sink.Memory<Record<string, unknown>, unknown>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory],
    });
    const logger = loggerFactory.Singleton();

    await logger.Run({ traceId: 'trace_1' }, async () => {
      const acc = logger.Accumulate();
      acc
        .Set({ userId: 'user_123' })
        .Set({ cart: { items: 3 } })
        .Error(new Error('Payment warning'), { step: 'payment' });

      acc.Emit('checkout.completed', { total: 99.99 });
    });

    expect(memory.events).toHaveLength(1);
    const event2 = memory.events[0];
    expect(event2?.payload).toBeDefined();
  });

  it('merges override context on emit', async function MergesOverrideContextOnEmit() {
    const contextSchema = z.object({ traceId: z.string(), userId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('context.merge', z.object({ ok: z.boolean() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );
    type Context = z.output<typeof contextSchema>;
    const memory = Sink.Memory<Context>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory] });
    const logger = loggerFactory.Singleton();

    await logger.Run({ traceId: 'trace_merge' }, async () => {
      logger.Emit('context.merge', { ok: true }, { userId: 'user_1' });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context).toEqual({ traceId: 'trace_merge', userId: 'user_1' });
  });

  it('emits metric and span kinds', async function EmitsMetricAndSpanKinds() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('metric.latency', z.object({ value: z.number() }), {
            kind: 'metric',
            require: ['traceId'] as const,
          }),
          registry.DefineEvent('span.checkout', z.object({ name: z.string() }), {
            kind: 'span',
            require: ['traceId'] as const,
          }),
        ] as const,
    );

    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory] });
    const logger = loggerFactory.Singleton();

    await logger.Run({ traceId: 'trace_kind' }, async () => {
      logger.Emit('metric.latency', { value: 10 });
      logger.Emit('span.checkout', { name: 'checkout' });
    });

    expect(memory.events[0]?.kind).toBe('metric');
    expect(memory.events[1]?.kind).toBe('span');
  });

  it('supports dynamic sampling rules', async function SupportsDynamicSamplingRules() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('sample.keep', z.object({ ok: z.boolean() }), { kind: 'log' }),
          registry.DefineEvent('sample.drop', z.object({ ok: z.boolean() }), { kind: 'log' }),
        ] as const,
    );
    const memory = Sink.Memory<z.output<typeof contextSchema>>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory],
      policy: {
        sample: {
          rate: 0,
          rules: [{ event: 'sample.keep', rate: 1 }],
        },
      },
    });
    const logger = loggerFactory.Singleton();

    logger.Emit('sample.keep', { ok: true });
    logger.Emit('sample.drop', { ok: true });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.name).toBe('sample.keep');
  });

  it('applies per-event rate limiting', async function AppliesPerEventRateLimiting() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('rate.limited', z.object({ ok: z.boolean() }), { kind: 'log' }),
        ] as const,
    );
    const memory = Sink.Memory<z.output<typeof contextSchema>>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory],
      policy: {
        rateLimit: {
          rules: [{ event: 'rate.limited', burst: 1, perSecond: 0 }],
        },
      },
    });
    const logger = loggerFactory.Singleton();

    logger.Emit('rate.limited', { ok: true });
    logger.Emit('rate.limited', { ok: true });

    expect(memory.events).toHaveLength(1);
  });

  it('applies context enrichers and trace injection', async function AppliesContextEnrichersAndTraceInjection() {
    process.env.TEST_REGION = 'eu-west-1';

    const contextSchema = z.object({
      traceId: z.string().optional(),
      spanId: z.string().optional(),
      traceparent: z.string().optional(),
      runtime: z.any().optional(),
      region: z.string().optional(),
    });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('context.enriched', z.object({ ok: z.boolean() }), {
            kind: 'log',
          }),
        ] as const,
    );
    const memory = Sink.Memory<z.output<typeof contextSchema>>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory],
      tracing: { provider: 'opentelemetry', injectTraceContext: true },
      enrichers: [Context.Runtime(), Context.Region({ envVarNames: ['TEST_REGION'] })],
    });
    const logger = loggerFactory.Singleton();

    await logger.Run(
      {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
      async () => {
        logger.Emit('context.enriched', { ok: true });
      },
    );

    const emittedContext = memory.events[0]?.context;
    expect(emittedContext?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(emittedContext?.spanId).toBe('00f067aa0ba902b7');
    expect(emittedContext?.region).toBe('eu-west-1');
    expect(typeof (emittedContext?.runtime as { name?: string } | undefined)?.name).toBe('string');

    delete process.env.TEST_REGION;
  });

  it('blocks events when pii guard is in block mode', function BlocksEventsWhenPiiGuardIsInBlockMode() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('pii.blocked', z.object({ email: z.string() }), {
            kind: 'log',
          }),
        ] as const,
    );
    const loggerFactory = TypedLogger.For(registry, {
      policy: {
        piiGuard: { mode: 'block', detectors: ['email'] },
      },
    });
    const logger = loggerFactory.Singleton();

    expect(() => logger.Emit('pii.blocked', { email: 'person@example.com' })).toThrowError(
      expect.objectContaining({
        code: 'LOGGER_PII_GUARD_BLOCKED',
        domain: 'logger',
      }),
    );
  });

  it('warns once for deprecated events', function WarnsOnceForDeprecatedEvents() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('deprecated.event', z.object({ ok: z.boolean() }), {
            kind: 'log',
            deprecated: true,
            deprecationMessage: 'Use event.v2',
          }),
        ] as const,
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loggerFactory = TypedLogger.For(registry);
    const logger = loggerFactory.Singleton();

    logger.Emit('deprecated.event', { ok: true });
    logger.Emit('deprecated.event', { ok: true });

    const matchingCalls = warnSpy.mock.calls.filter((call) =>
      String(call[0] ?? '').includes('deprecated.event'),
    );
    expect(matchingCalls).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it('captures thrown logger errors as internal events when enabled', function CapturesThrownLoggerErrorsAsInternalEventsWhenEnabled() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('known.event', z.object({ ok: z.boolean() }), {
            kind: 'log',
          }),
        ] as const,
    );
    const memory = Sink.Memory<z.output<typeof contextSchema>>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory],
      captureErrorsAsEvent: true,
    });
    const logger = loggerFactory.Singleton();

    expect(() =>
      (logger as unknown as { Emit: (name: string, payload: unknown) => unknown }).Emit(
        'missing.event',
        {},
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'LOGGER_UNKNOWN_EVENT',
        domain: 'logger',
      }),
    );

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.name).toBe('typedlog.internal.error');
    expect(memory.events[0]?.level).toBe('error');

    const payload = memory.events[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.code).toBe('LOGGER_UNKNOWN_EVENT');
    expect(payload?.domain).toBe('logger');
    expect(payload?.source).toBe('emit');
  });
});
