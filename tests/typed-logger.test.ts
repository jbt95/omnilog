import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  Registry,
  Sink,
  TypedLogger,
} from '../src/index.js';

describe('TypedLogger', function TypedLoggerSuite() {
  it('provides scoped logger via factory', async function ProvidesScopedLoggerViaFactory() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(contextSchema, (registry) => [
      registry.DefineEvent(
        'user.logged',
        z.object({ id: z.string() }),
        { kind: 'log', require: ['traceId'] as const },
      ),
    ] as const);
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory] });

    await loggerFactory.Scoped({ traceId: 'trace_factory' }, (logger) => {
      logger.Emit('user.logged', { id: 'user_1' });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_factory');
  });

  it('throws when factory Get is called outside scope', function ThrowsWhenFactoryGetCalledOutsideScope() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(contextSchema, (registry) => [
      registry.DefineEvent('factory.missing', z.object({ ok: z.boolean() }), {
        kind: 'log',
        require: ['traceId'] as const,
      }),
    ] as const);
    const loggerFactory = TypedLogger.For(registry);

    expect(() => loggerFactory.Get()).toThrow('No logger available in the current scope');
  });

  it('exposes logger via Get inside scope', async function ExposesLoggerViaGetInsideScope() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(contextSchema, (registry) => [
      registry.DefineEvent('factory.get', z.object({ ok: z.boolean() }), {
        kind: 'log',
        require: ['traceId'] as const,
      }),
    ] as const);
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory] });

    await loggerFactory.Scoped({ traceId: 'trace_get' }, (_logger) => {
      const loggerFromGet = loggerFactory.Get();
      loggerFromGet.Emit('factory.get', { ok: true });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_get');
  });

  it('creates logger factory from Create', async function CreatesLoggerFactoryFromCreate() {
    const contextSchema = z.object({ traceId: z.string() });
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = TypedLogger.Create({
      contextSchema,
      events: (registry) => [
        registry.DefineEvent('create.event', z.object({ ok: z.boolean() }), {
          kind: 'log',
          require: ['traceId'] as const,
        }),
      ] as const,
      sinks: [memory],
    });

    await loggerFactory.Scoped({ traceId: 'trace_create' }, (logger) => {
      logger.Emit('create.event', { ok: true });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_create');
  });

  it('returns stable singleton instance', async function ReturnsStableSingletonInstance() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = Registry.Create(contextSchema, (registry) => [
      registry.DefineEvent('singleton.event', z.object({ ok: z.boolean() }), {
        kind: 'log',
        require: ['traceId'] as const,
      }),
    ] as const);
    const memory = Sink.Memory<{ traceId: string }>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory] });
    const loggerA = loggerFactory.Singleton();
    const loggerB = loggerFactory.Singleton();

    expect(loggerA).toBe(loggerB);

    await loggerA.Run({ traceId: 'trace_singleton' }, async () => {
      loggerA.Emit('singleton.event', { ok: true });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_singleton');
  });
});
