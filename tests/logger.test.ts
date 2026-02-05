import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CreateMemorySink,
  CreateRegistry,
  DefineEvent,
  TypedLogger,
} from '../src/index.js';

describe('Logger', function LoggerSuite() {
  it('redacts tagged fields', async function RedactsTaggedFields() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const event = DefineEvent(
      'user.signed_in',
      z.object({ email: z.string().email(), ip: z.string() }),
      {
        kind: 'log',
        require: ['traceId'] as const,
        tags: {
          'payload.email': 'pii',
        },
      },
    );

    const registry = CreateRegistry(contextSchema, [event] as const);
    type Context = z.infer<typeof contextSchema>;
    const memory = CreateMemorySink<Context>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory.Sink],
      policy: { redact: ['pii'] },
    });
    const logger = loggerFactory.Singleton();

    await logger.Run({ traceId: 'trace_1' }, async () => {
      await logger.Emit('user.signed_in', {
        email: 'person@example.com',
        ip: '127.0.0.1',
      });
    });

    const payload = memory.events[0]?.payload as { email?: string } | undefined;
    expect(payload?.email).toBe('[REDACTED]');
  });

  it('enforces required context', async function EnforcesRequiredContext() {
    const contextSchema = z.object({ traceId: z.string().optional() });
    const event = DefineEvent('order.created', z.object({ id: z.string() }), {
      kind: 'log',
      require: ['traceId'] as const,
    });

    const registry = CreateRegistry(contextSchema, [event] as const);
    const loggerFactory = TypedLogger.For(registry);
    const logger = loggerFactory.Singleton();

    await expect(logger.Emit('order.created', { id: 'order_1' })).rejects.toThrow(
      'Missing required context',
    );
  });

  it('accumulates context with Accumulate()', async function AccumulatesContextWithAccumulate() {
    const contextSchema = z.object({
      traceId: z.string(),
      userId: z.string().optional(),
      cart: z.any().optional(),
    });
    const event = DefineEvent('checkout.completed', z.object({ total: z.number() }), {
      kind: 'log',
      require: ['traceId'] as const,
    });

    const registry = CreateRegistry(contextSchema, [event] as const);
    const memory = CreateMemorySink<Record<string, unknown>, unknown>();
    const loggerFactory = TypedLogger.For(registry, {
      sinks: [memory.Sink],
    });
    const logger = loggerFactory.Singleton();

    await logger.Run({ traceId: 'trace_1' }, async () => {
      const acc = logger.Accumulate();
      acc
        .Set({ userId: 'user_123' })
        .Set({ cart: { items: 3 } })
        .Error(new Error('Payment warning'), { step: 'payment' });

      await acc.Emit('checkout.completed', { total: 99.99 });
    });

    expect(memory.events).toHaveLength(1);
    const event2 = memory.events[0];
    expect(event2?.payload).toBeDefined();
  });

  it('merges override context on emit', async function MergesOverrideContextOnEmit() {
    const contextSchema = z.object({ traceId: z.string(), userId: z.string().optional() });
    const event = DefineEvent('context.merge', z.object({ ok: z.boolean() }), {
      kind: 'log',
      require: ['traceId'] as const,
    });
    const registry = CreateRegistry(contextSchema, [event] as const);
    const memory = CreateMemorySink<{ traceId: string; userId?: string }>();
    const loggerFactory = TypedLogger.For(registry, { sinks: [memory.Sink] });
    const logger = loggerFactory.Singleton();

    await logger.Run({ traceId: 'trace_merge' }, async () => {
      await logger.Emit('context.merge', { ok: true }, { userId: 'user_1' });
    });

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context).toEqual({ traceId: 'trace_merge', userId: 'user_1' });
  });
});
