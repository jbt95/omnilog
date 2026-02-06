# OmniLog

Schema-first, type-safe structured logging and observability for TypeScript.

> ⚠️ **Warning: Not Production Ready**
> This library is in early development. APIs may change, and it has not been battle-tested in production environments. Use at your own risk.

## Features

- Schema-first event definitions with Zod validation
- Type-safe payloads and context inferred from schemas
- Request-scoped logging via `AsyncLocalStorage`
- Granular structured errors with stable `code` and `domain` values
- Event-level governance with redaction and PII guardrails
- Dynamic sampling and per-event rate limiting
- Automatic exception capture in framework integrations (`omnilog.internal.error`)
- Manual service-level exception capture with `logger.CaptureError(...)`
- Typed drain handles with retry, backpressure, telemetry, and dead-letter support
- Provider-native drains for Axiom, OTLP, Webhook, Datadog, Loki, and Better Stack
- Dead-letter replay tooling for recovery workflows
- Context enrichers and trace correlation support
- Official integrations for Express, Hono, NestJS, AWS Lambda, and Cloudflare Workers
- Real-server e2e suites for Express, Hono, and NestJS
- Memory sink and policy simulation for testing

## Installation

```bash
npm install omnilog zod
```

### Requirements

- Node.js >= 20

## Quick Start

```typescript
import { z } from 'zod';
import { Registry, Sink, OmniLogger } from 'omnilog';

const contextSchema = z.object({
  traceId: z.string(),
  userId: z.string().optional(),
});

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
          tags: { 'payload.email': 'pii' },
        },
      ),
    ] as const,
);

const loggerFactory = OmniLogger.For(registry, {
  sinks: [Sink.Environment()],
  policy: { redact: ['pii'] },
});

await loggerFactory.Scoped({ traceId: 'abc123', userId: 'user_1' }, (logger) => {
  logger.Emit('user.signed_in', { email: 'user@example.com', ip: '192.168.1.1' });
});
```

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
const loggerFactory = OmniLogger.For(registry, { sinks: [memory] });

await loggerFactory.Scoped({ traceId: 'test' }, (logger) => {
  logger.Emit('user.signed_in', { email: 'test@example.com', ip: '127.0.0.1' });
});

expect(memory.events).toHaveLength(1);
```

## Drains

Drains send batches of events to external systems. Use them as sinks on the logger factory.
`Emit` is synchronous; drains handle async delivery. Call `Flush()` (or wrap with `Context.AutoFlush`) before shutdown when you need guarantees.

```typescript
import { Drain } from 'omnilog';

const drain = Drain.AxiomSink({ dataset: 'app', batchSize: 100, flushInterval: 5000 });

const loggerFactory = OmniLogger.For(registry, {
  sinks: [drain.Sink],
});

await drain.Flush();
```

### Drain Reliability

Built-in drain sinks support retries, queue backpressure, telemetry, and dead-letter handling.

```typescript
const deadLetterSink = Drain.DeadLetterFile({ path: './dead-letter.ndjson' });

const drain = Drain.WebhookSink({
  url: process.env.LOG_WEBHOOK_URL!,
  batchSize: 100,
  flushInterval: 2000,
  retry: { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 3000, jitter: 'full' },
  queue: { maxItems: 10000, strategy: 'drop-oldest' },
  telemetry: { sink: (metric) => console.log(metric) },
  deadLetterSink,
});
```

### More Drains

```typescript
const otlpDrain = Drain.OTLPSink({
  endpoint: process.env.OTLP_ENDPOINT ?? 'http://localhost:4318',
});

const datadogDrain = Drain.DatadogSink({
  apiKey: process.env.DATADOG_API_KEY,
  site: 'us1',
  service: 'checkout-api',
});

const lokiDrain = Drain.LokiSink({
  endpoint: 'https://loki.example.com/loki/api/v1/push',
  bearerToken: process.env.LOKI_TOKEN,
  labels: { app: 'checkout-api', env: 'prod' },
  includeEventNameLabel: true,
});

const betterStackDrain = Drain.BetterStackSink({
  sourceToken: process.env.BETTERSTACK_SOURCE_TOKEN,
});
```

Use the same sink-handle shape for all providers:

```typescript
const loggerFactory = OmniLogger.For(registry, { sinks: [datadogDrain.Sink] });
await datadogDrain.Flush();
```

### Drain Replay

```typescript
const source = Drain.FileSource({ path: './dead-letter.ndjson' });
const replay = await source.ReplayTo(drain.Sink, { maxPerSecond: 500 });
await drain.Flush();
console.log(replay); // { replayed, failed }
```

## Sampling and Rate Limits

```typescript
const loggerFactory = OmniLogger.For(registry, {
  sinks: [drain.Sink],
  policy: {
    sample: {
      rate: 0.2,
      adaptive: true,
      rules: [{ event: 'error.raised', rate: 1 }],
    },
    rateLimit: {
      rules: [{ event: 'http.request', burst: 200, perSecond: 100 }],
    },
  },
});
```

## Context Enrichers and Tracing

```typescript
const loggerFactory = OmniLogger.For(registry, {
  sinks: [drain.Sink],
  tracing: { provider: 'opentelemetry', injectTraceContext: true },
  enrichers: [
    Context.Runtime(),
    Context.Region(),
    Context.RequestHeaders(['user-agent', 'cf-ray']),
  ],
});
```

## PII Guard and Simulation

```typescript
const loggerFactory = OmniLogger.For(registry, {
  sinks: [drain.Sink],
  policy: {
    piiGuard: { mode: 'warn', detectors: ['email', 'phone'], requireTags: true },
  },
});

const simulation = OmniLogger.Simulate({
  registry,
  name: 'user.signed_in',
  context: { traceId: 'trace_1' },
  payload: { email: 'person@example.com' },
  policy: { redact: ['pii'] },
});
```

## Schema Compatibility

```typescript
const previous = Registry.Export(previousRegistry);
const report = Registry.Compare(previous, currentRegistry);
if (!report.compatible) {
  console.error(report.issues);
}
```

## Errors

OmniLog exposes structured errors with stable `code` and `domain` values.

```typescript
import { Error as LogError } from 'omnilog';

try {
  logger.Emit('user.signed_in', payload);
} catch (raw) {
  const error = LogError.Parse(raw);
  console.error(error.code, error.domain, error.message);
}
```

You can also emit internal error events automatically:

```typescript
const loggerFactory = OmniLogger.For(registry, {
  sinks: [drain.Sink],
  captureErrorsAsEvent: {
    enabled: true,
    eventName: 'omnilog.internal.error',
    level: 'error',
  },
});
```

Or capture service-level errors manually:

```typescript
await loggerFactory.Scoped({ traceId: 'req-1' }, async (logger) => {
  try {
    await service.DoWork();
  } catch (error) {
    logger.CaptureError(error, {
      source: 'service.orders',
      details: { operation: 'DoWork' },
    });
    throw error;
  }
});
```

```typescript
throw LogError.Create({
  message: 'Missing request context',
  code: 'OMNI_LOGGER_NO_SCOPE',
  domain: 'omni-logger',
  resolution: 'Wrap your code inside loggerFactory.Scoped(...)',
});
```

### Common Error Codes

| Code                              | Domain        | Meaning                                       |
| --------------------------------- | ------------- | --------------------------------------------- |
| `LOGGER_UNKNOWN_EVENT`            | `logger`      | Emitted event name does not exist in registry |
| `LOGGER_INVALID_PAYLOAD`          | `logger`      | Payload failed schema validation              |
| `LOGGER_INVALID_CONTEXT`          | `logger`      | Context failed schema validation              |
| `LOGGER_MISSING_REQUIRED_CONTEXT` | `logger`      | Required context key is missing               |
| `LOGGER_PII_GUARD_BLOCKED`        | `logger`      | PII guard blocked emission                    |
| `LOGGER_RATE_LIMIT_EXCEEDED`      | `logger`      | Rate limit exceeded and `onLimit: 'throw'`    |
| `OMNI_LOGGER_NO_SCOPE`            | `omni-logger` | `Get()` was called outside `Scoped(...)`      |
| `REGISTRY_DUPLICATE_EVENT`        | `registry`    | Two events share the same name                |
| `DRAIN_HTTP_FAILURE`              | `drain`       | Drain provider returned non-2xx response      |
| `DRAIN_TIMEOUT`                   | `drain`       | Drain send attempt timed out                  |

## Integrations

Integrations use official framework types. Install the corresponding packages to get full typing support.
`Middleware.Express`, `Middleware.Hono`, `Handler.Lambda`, `Handler.Worker`, and `OmniLogModule` handlers automatically catch thrown user errors, emit `omnilog.internal.error`, and then rethrow the original error.

### Automatic Exception Capture

Framework integrations now capture exceptions thrown by user handlers/middleware, emit an internal event, and rethrow the original error.

```typescript
const loggerFactory = OmniLogger.For(registry, {
  sinks: [drain.Sink],
});

// On thrown user errors, integrations emit:
// event name: "omnilog.internal.error"
// payload includes: message, code, domain, source, stack
```

### Express

```typescript
import { Middleware } from 'omnilog';

app.use(
  Middleware.Express(loggerFactory, {
    LoggerKey: 'logger',
    GetContext: (req) => ({ userId: req.header('x-user-id') }),
  }),
);

app.get('/orders/:id', (req, res) => {
  throw new Error('Database unavailable');
  // The middleware captures and emits omnilog.internal.error, then rethrows.
});
```

### Hono

```typescript
import { Middleware } from 'omnilog';

app.use(
  Middleware.Hono(loggerFactory, {
    LoggerKey: 'logger',
    GetContext: (c) => ({ userId: c.req.header('x-user-id') }),
  }),
);
```

### NestJS

```typescript
import { Module } from '@nestjs/common';
import { OmniLogModule } from 'omnilog';

@Module({
  imports: [
    OmniLogModule.forRoot({
      loggerFactory,
      LoggerKey: 'logger',
      GetContext: (req) => ({ userId: req.header('x-user-id') }),
    }),
  ],
})
export class AppModule {}
```

### AWS Lambda

```typescript
import { Handler } from 'omnilog';

export const handler = Handler.Lambda(loggerFactory, async (event, context, logger) => {
  logger.Emit('lambda.invoke', { path: event.rawPath });
  if (!event.rawPath) throw new Error('Missing rawPath');
  return { statusCode: 200, body: 'ok' };
});
// Handler.Lambda captures thrown errors as omnilog.internal.error and rethrows.
```

### Cloudflare Workers

Workers require `nodejs_compat` to use `AsyncLocalStorage`.

```typescript
import { Handler } from 'omnilog';

export default {
  fetch: Handler.Worker(loggerFactory, async (request, env, ctx, logger) => {
    logger.Emit('http.request', { path: new URL(request.url).pathname });
    return new Response('ok');
  }),
};
```

## API Overview

- `Registry.Create(contextSchema, (registry) => events)`
- `registry.DefineEvent(name, schema, options)`
- `Registry.SchemaFingerprint(schema)`
- `OmniLogger.For(registry, options)`
- `OmniLogger.For(...).Scoped(context, (logger) => fn)`
- `OmniLogger.For(...).Get()`
- `logger.CaptureError(error, { source, details })`
- `OmniLogger.Simulate(...)`
- `Sink.Environment()`
- `Sink.Memory()`
- `Sink.Visual()`, `Sink.Structured()`
- `Drain.AxiomSink()`, `Drain.OTLPSink()`, `Drain.WebhookSink()`
- `Drain.DatadogSink()`, `Drain.LokiSink()`, `Drain.BetterStackSink()`
- `Drain.DeadLetterFile()`, `Drain.FileSource()`, `Drain.Fingerprint()`
- `Error.Create()`, `Error.Domain()`, `Error.Parse()`, `Error.Omni`
- `Redaction.Apply()`, `Redaction.Policy()`
- `Context.Create()`, `Context.Runtime()`, `Context.Region()`, `Context.RequestHeaders()`
- `Context.Request()`, `Context.Extract()`, `Context.AutoFlush()`
- `Middleware.Express()`, `Middleware.Hono()`
- `Handler.Lambda()`, `Handler.Worker()`
- `OmniLogModule.forRoot(...)`

## Testing

- `pnpm test` runs unit/integration tests (fast feedback, includes non-runtime integration tests).
- `pnpm test:e2e` runs real-server e2e tests for Express, Hono, and NestJS using real HTTP requests.
- `pnpm test:all` runs both suites.
- `pnpm run typecheck` validates TypeScript types.

Lambda and Cloudflare Worker integrations are covered with non-server integration tests because they are different runtime models.

## Development Notes

- Drain tests are organized per provider in `tests/drain-*.test.ts`.

## License

MIT
