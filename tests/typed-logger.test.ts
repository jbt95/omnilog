import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CreateMemorySink,
  CreateRegistry,
  TypedLogger,
} from '../src/index.js';

describe('TypedLogger', function TypedLoggerSuite() {
  it('provides scoped logger via factory', async function ProvidesScopedLoggerViaFactory() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = CreateRegistry(contextSchema, (registry) => [
      registry.DefineEvent(
        'user.logged',
        z.object({ id: z.string() }),
        { kind: 'log', require: ['traceId'] as const },
      ),
    ] as const);
    const memory = CreateMemorySink<{ traceId: string }>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory.Sink] });

    await loggerFactory.Scoped({ traceId: 'trace_factory' }, async () => {
      const logger = loggerFactory.Get();
      await logger.Emit('user.logged', { id: 'user_1' });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_factory');
  });

  it('throws when factory Get is called outside scope', function ThrowsWhenFactoryGetCalledOutsideScope() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = CreateRegistry(contextSchema, (registry) => [
      registry.DefineEvent('factory.missing', z.object({ ok: z.boolean() }), {
        kind: 'log',
        require: ['traceId'] as const,
      }),
    ] as const);
    const loggerFactory = TypedLogger.For(registry);

    expect(() => loggerFactory.Get()).toThrow('No logger available in the current scope');
  });

  it('returns stable singleton instance', async function ReturnsStableSingletonInstance() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = CreateRegistry(contextSchema, (registry) => [
      registry.DefineEvent('singleton.event', z.object({ ok: z.boolean() }), {
        kind: 'log',
        require: ['traceId'] as const,
      }),
    ] as const);
    const memory = CreateMemorySink<{ traceId: string }>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory.Sink] });
    const loggerA = loggerFactory.Singleton();
    const loggerB = loggerFactory.Singleton();

    expect(loggerA).toBe(loggerB);

    await loggerA.Run({ traceId: 'trace_singleton' }, async () => {
      await loggerA.Emit('singleton.event', { ok: true });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.traceId).toBe('trace_singleton');
  });
});
