import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Registry, Sink, OmniLogger } from '../src/index.js';

describe('OmniLogger', function OmniLoggerSuite() {
  it('provides scoped logger via factory', async function ProvidesScopedLoggerViaFactory() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('user.logged', z.object({ id: z.string() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = OmniLogger.For(registry, { sinks: [memory] });

    await loggerFactory.Scoped({ traceId: 'trace_factory' }, (logger) => {
      logger.Emit('user.logged', { id: 'user_1' });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_factory');
  });

  it('throws when factory Get is called outside scope', function ThrowsWhenFactoryGetCalledOutsideScope() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('factory.missing', z.object({ ok: z.boolean() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );
    const loggerFactory = OmniLogger.For(registry);

    expect(() => loggerFactory.Get()).toThrowError(
      expect.objectContaining({
        code: 'OMNI_LOGGER_NO_SCOPE',
        domain: 'omni-logger',
      }),
    );
  });

  it('exposes logger via Get inside scope', async function ExposesLoggerViaGetInsideScope() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('factory.get', z.object({ ok: z.boolean() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = OmniLogger.For(registry, { sinks: [memory] });

    await loggerFactory.Scoped({ traceId: 'trace_get' }, (_logger) => {
      const loggerFromGet = loggerFactory.Get();
      loggerFromGet.Emit('factory.get', { ok: true });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_get');
  });

  it('returns stable singleton instance', async function ReturnsStableSingletonInstance() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('singleton.event', z.object({ ok: z.boolean() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = OmniLogger.For(registry, { sinks: [memory] });
    const loggerA = loggerFactory.Singleton();
    const loggerB = loggerFactory.Singleton();

    expect(loggerA).toBe(loggerB);

    await loggerA.Run({ traceId: 'trace_singleton' }, async () => {
      loggerA.Emit('singleton.event', { ok: true });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_singleton');
  });

  it('simulates policy and redaction', function SimulatesPolicyAndRedaction() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('simulate.event', z.object({ email: z.string(), ok: z.boolean() }), {
            kind: 'log',
            tags: { 'payload.email': 'pii' },
          }),
        ] as const,
    );

    const simulation = OmniLogger.Simulate({
      registry,
      name: 'simulate.event',
      context: { traceId: 'trace_simulate' },
      payload: { email: 'person@example.com', ok: true },
      policy: { redact: ['pii'] },
    });

    expect(simulation.accepted).toBe(true);
    expect(simulation.redacted?.payload).toEqual({ email: '[REDACTED]', ok: true });
  });

  it('shares rate limit state across scoped loggers', async function SharesRateLimitStateAcrossScopedLoggers() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('scoped.ratelimit', z.object({ ok: z.boolean() }), {
            kind: 'log',
          }),
        ] as const,
    );
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = OmniLogger.For(registry, {
      sinks: [memory],
      policy: {
        rateLimit: {
          rules: [{ event: 'scoped.ratelimit', burst: 1, perSecond: 0 }],
        },
      },
    });

    await loggerFactory.Scoped({ traceId: 'trace_1' }, (logger) => {
      logger.Emit('scoped.ratelimit', { ok: true });
    });
    await loggerFactory.Scoped({ traceId: 'trace_2' }, (logger) => {
      logger.Emit('scoped.ratelimit', { ok: true });
    });

    expect(memory.events).toHaveLength(1);
  });

  it('throws structured simulation errors for invalid input', function ThrowsStructuredSimulationErrorsForInvalidInput() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('simulate.invalid', z.object({ ok: z.boolean() }), {
            kind: 'log',
            require: ['traceId'] as const,
          }),
        ] as const,
    );

    expect(() =>
      OmniLogger.Simulate({
        registry,
        name: 'simulate.invalid',
        context: {} as unknown as { traceId: string },
        payload: { ok: true },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'SIMULATION_INVALID_INPUT',
        domain: 'omni-logger',
      }),
    );
  });
});
