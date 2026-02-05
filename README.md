# typedlog

Schema-first, type-safe structured logging and observability for TypeScript.

> ⚠️ **Warning: Not Production Ready**
> This library is in early development. APIs may change, and it has not been battle-tested in production environments. Use at your own risk.

## Features

- Schema-first event definitions with Zod validation
- Type-safe payloads and context inferred from schemas
- Request-scoped logging via `AsyncLocalStorage`
- Field-level redaction with tag-based policies
- Pluggable sinks and drains (Axiom, OTLP, webhook)
- Memory sink for tests

## Installation

```bash
npm install typedlog zod
```

### Requirements

- Node.js >= 20

## Quick Start

```typescript
import { z } from 'zod';
import { Sink, TypedLogger } from 'typedlog';

const contextSchema = z.object({
  traceId: z.string(),
  userId: z.string().optional(),
});

const loggerFactory = TypedLogger.Create({
  contextSchema,
  events: (registry) =>
    [
      registry.DefineEvent(
        'user.signed_in',
        z.object({ email: z.string().email(), ip: z.string() }),
        {
          kind: 'log',
          require: ['traceId'] as const,
          tags: { 'payload.email': 'pii' },
        },
      ),
    ] as const,
  sinks: [Sink.Environment()],
  policy: { redact: ['pii'] },
});

await loggerFactory.Scoped({ traceId: 'abc123', userId: 'user_1' }, (logger) => {
  logger.Emit('user.signed_in', { email: 'user@example.com', ip: '192.168.1.1' });
});
```

Advanced usage: use `Registry.Create(...)` and `TypedLogger.For(registry, options)` when you need to export a registry or share it across modules.

## Defining Events

`registry.DefineEvent` infers payload types and provides tag autocomplete for `payload.*` paths.

```typescript
const registry = Registry.Create(
  contextSchema,
  (registry) =>
    [
      registry.DefineEvent('metric.latency', z.object({ value: z.number(), unit: z.string() }), {
        kind: 'metric',
      }),
    ] as const,
);
```

## Request-Scoped Logging

Use `Scoped` to create a per-request logger and access it directly in the callback.

```typescript
await loggerFactory.Scoped({ traceId: 'req_1' }, (logger) => {
  logger.Emit('user.signed_in', { email: 'user@example.com', ip: '10.0.0.1' });
});
```

## Testing With Memory Sink

```typescript
const memory = Sink.Memory<{ traceId: string }>();
const loggerFactory = TypedLogger.For(registry, { sinks: [memory] });

await loggerFactory.Scoped({ traceId: 'test' }, (logger) => {
  logger.Emit('user.signed_in', { email: 'test@example.com', ip: '127.0.0.1' });
});

expect(memory.events).toHaveLength(1);
```

## Drains

Drains send batches of events to external systems. Use them as sinks on the logger factory.
`Emit` is synchronous; drains handle async delivery. Call `Flush()` (or wrap with `Context.AutoFlush`) before shutdown when you need guarantees.

```typescript
import { Drain } from 'typedlog';

const drain = Drain.AxiomSink({ dataset: 'app', batchSize: 100, flushInterval: 5000 });

const loggerFactory = TypedLogger.For(registry, {
  sinks: [drain.Sink],
});

await drain.Flush();
```

## API Overview

- `TypedLogger.Create({ contextSchema, events, sinks, policy, context })`
- `Registry.Create(contextSchema, (registry) => events)`
- `registry.DefineEvent(name, schema, options)`
- `TypedLogger.For(registry, options)`
- `TypedLogger.For(...).Scoped(context, (logger) => fn)`
- `TypedLogger.For(...).Get()`
- `Sink.Environment()`
- `Sink.Memory()`
- `Drain.AxiomSink()`, `Drain.OTLPSink()`, `Drain.WebhookSink()`
- `Drain.Axiom()`, `Drain.OTLP()`, `Drain.Webhook()`, `new Drain.Batched()`

## License

MIT
