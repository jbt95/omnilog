# typedlog

Schema-first, type-safe structured logging and observability for TypeScript.

## Installation

```bash
npm install typedlog zod
```

## Quick Start

```typescript
import { z } from 'zod';
import { TypedLogger, CreateRegistry } from 'typedlog';

const contextSchema = z.object({
  traceId: z.string(),
  userId: z.string().optional(),
});

const registry = CreateRegistry(contextSchema, (registry) => [
  registry.DefineEvent(
    'user.signed_in',
    z.object({ email: z.string().email(), ip: z.string() }),
    { kind: 'log', require: ['traceId'] as const, tags: { 'payload.email': 'pii' } },
  ),
] as const);

const loggerFactory = TypedLogger.For(registry);

await loggerFactory.Scoped({ traceId: 'abc123' }, async () => {
  const logger = loggerFactory.Get();
  await logger.Emit('user.signed_in', { email: 'user@example.com', ip: '192.168.1.1' });
});
```

## API Essentials

- `CreateRegistry(contextSchema, (registry) => events)`
  - `registry.DefineEvent(name, schema, config)` provides tag autocompletion based on payload schema
- `TypedLogger.For(registry, options)`
  - `Singleton()` for shared logger
  - `Scoped(context, fn)` for request scope
  - `Get()` for current scoped logger

## Drains

Drains send batches of events to external systems (Axiom, OTLP, webhooks). Use them as sinks on the logger factory.

```typescript
import { TypedLogger, CreateRegistry, CreateAxiomDrain, BatchedDrain } from 'typedlog';

const registry = CreateRegistry(contextSchema, (registry) => [
  registry.DefineEvent('user.signed_in', z.object({ email: z.string() }), { kind: 'log' }),
] as const);

const axiom = CreateAxiomDrain({ dataset: 'app' });
const batched = new BatchedDrain(axiom, { batchSize: 100, flushInterval: 5000 });

const loggerFactory = TypedLogger.For(registry, {
  sinks: [batched.CreateSink()],
});
```

## License

MIT
