# typedlog

Schema-first, type-safe structured logging and observability for TypeScript.

> **Warning**: This library is in early development and not production-ready. APIs may change, and features are incomplete. Use at your own risk.

## Installation

```bash
npm install typedlog zod
```

## Quick Start

```typescript
import { z } from 'zod';
import { TypedLogger, CreateRegistry, DefineEvent, CreateEnvironmentSink } from 'typedlog';

const contextSchema = z.object({
  traceId: z.string(),
  userId: z.string().optional(),
});

const userSignedIn = DefineEvent(
  'user.signed_in',
  z.object({ email: z.string().email(), ip: z.string() }),
  { kind: 'log', require: ['traceId'] as const, tags: { 'payload.email': 'pii' } },
);

const registry = CreateRegistry(contextSchema, [userSignedIn] as const);
const loggerFactory = TypedLogger.For(registry, {
  sinks: [CreateEnvironmentSink()],
});

await loggerFactory.Scoped({ traceId: 'abc123' }, async () => {
  const logger = loggerFactory.Get();
  await logger.Emit('user.signed_in', { email: 'user@example.com', ip: '192.168.1.1' });
});
```

## API Essentials

### Define Events

```typescript
const userLogin = DefineEvent(
  'user.login',
  z.object({ userId: z.string(), email: z.string().email() }),
  {
    kind: 'log',
    level: 'info',
    require: ['traceId'] as const,
    tags: { 'payload.email': 'pii' },
    description: 'User login event',
  },
);
```

### Create Registry

```typescript
const registry = CreateRegistry(contextSchema, [userLogin] as const);
```

### Logger Factory

```typescript
const loggerFactory = TypedLogger.For(registry, {
  sinks: [CreateEnvironmentSink()],
  policy: { redact: ['pii'] },
});

// Singleton for shared usage
const logger = loggerFactory.Singleton();

// Scoped for request context
await loggerFactory.Scoped({ traceId: 'abc' }, async () => {
  const logger = loggerFactory.Get();
  await logger.Emit('user.login', { userId: '123', email: 'user@example.com' });
});
```

## Sinks

Sinks control where events are written.

| Sink                      | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `CreateEnvironmentSink()` | Visual in dev, JSON in production (default) |
| `CreateVisualSink()`      | Pretty tree format for development          |
| `CreateStructuredSink()`  | NDJSON for production log aggregation       |
| `CreateMemorySink()`      | Capture events in memory for testing        |

```typescript
import { CreateVisualSink, CreateStructuredSink, CreateMemorySink } from 'typedlog';

// Development: pretty output
const devSink = CreateVisualSink();

// Production: JSON lines
const prodSink = CreateStructuredSink();

// Testing: capture and assert
const memory = CreateMemorySink();
await logger.Emit('user.login', { userId: '123' });
expect(memory.events[0].payload.userId).toBe('123');
```

## Drains

Drains send events to external observability platforms.

```typescript
import { CreateAxiomDrain, CreateOTLPDrain, CreateWebhookDrain, BatchedDrain } from 'typedlog';

// Axiom.co
const axiom = CreateAxiomDrain({ dataset: 'app' });

// OpenTelemetry (Grafana, Datadog, Honeycomb)
const otlp = CreateOTLPDrain({ endpoint: 'http://localhost:4318' });

// Custom webhook
const webhook = CreateWebhookDrain({ url: 'https://api.example.com/logs' });

// Batch for efficiency
const batched = new BatchedDrain(axiom, { batchSize: 100, flushInterval: 5000 });

const loggerFactory = TypedLogger.For(registry, {
  sinks: [batched.CreateSink()],
});
```

## Field Tags & Redaction

Tag sensitive fields for automatic redaction:

```typescript
const event = DefineEvent(
  'user.checkout',
  z.object({ email: z.string(), ssn: z.string(), token: z.string() }),
  {
    kind: 'log',
    tags: {
      'payload.email': 'pii',
      'payload.ssn': ['pii', 'sensitive'],
      'payload.token': 'secret',
    },
  },
);

// Redaction modes
const loggerFactory = TypedLogger.For(registry, {
  policy: { redactionMode: 'strict' }, // Redact pii, secret, token, sensitive
});

// Modes: 'strict' | 'lenient' | 'dev'
// - strict: redact all tagged fields
// - lenient: redact secret, token, sensitive only
// - dev: redact secret, token only (show PII in development)
```

## Context Management

### Basic Context

```typescript
import { CreateContext } from 'typedlog';

const context = CreateContext(z.object({ traceId: z.string() }));

await context.Run({ traceId: 'abc' }, async () => {
  const current = context.Get(); // { traceId: 'abc' }
});
```

### HTTP Framework Integration

Full example with Express-style middleware:

```typescript
import express from 'express';
import { z } from 'zod';
import {
  TypedLogger,
  CreateRegistry,
  DefineEvent,
  CreateRequestContext,
  ExtractRequestContext,
  CreateEnvironmentSink,
} from 'typedlog';

// Define your context schema
const contextSchema = z.object({
  traceId: z.string(),
  userId: z.string().optional(),
});

// Define events
const httpRequest = DefineEvent(
  'http.request',
  z.object({ method: z.string(), path: z.string(), duration: z.number() }),
  { kind: 'log', level: 'info', require: ['traceId'] as const },
);

const userAction = DefineEvent('user.action', z.object({ action: z.string() }), {
  kind: 'log',
  require: ['traceId'] as const,
});

// Create registry and logger factory
const registry = CreateRegistry(contextSchema, [httpRequest, userAction] as const);
const loggerFactory = TypedLogger.For(registry, {
  sinks: [CreateEnvironmentSink()],
});

// Create request context manager
const requestContext = CreateRequestContext(contextSchema);

// Express app setup
const app = express();

// Middleware to set up logging context for each request
app.use((req, res, next) => {
  // Extract request info (method, path, requestId, etc.)
  const requestInfo = ExtractRequestContext(req);

  // Generate trace ID
  const traceId = req.headers['x-request-id'] || crypto.randomUUID();

  // Run handler within scoped context
  requestContext.Run({ ...requestInfo, traceId }, async () => {
    const logger = loggerFactory.Get();

    // Log the request
    const startTime = Date.now();
    res.on('finish', () => {
      logger.Emit('http.request', {
        method: req.method,
        path: req.path,
        duration: Date.now() - startTime,
      });
    });

    next();
  });
});

// Route handler - logger context is automatically available
app.post('/api/users', async (req, res) => {
  const logger = loggerFactory.Get();

  // Context (traceId, method, path, etc.) is automatically included
  await logger.Emit('user.action', { action: 'create_user' });

  // Your business logic here
  const user = await createUser(req.body);

  res.json(user);
});

// Error handler
app.use((err, req, res, next) => {
  const logger = loggerFactory.Get();

  logger.Emit('http.error', {
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({ error: 'Internal server error' });
});
```

The `ExtractRequestContext` function extracts these fields from a Request:

- `method` - HTTP method (GET, POST, etc.)
- `path` - URL pathname
- `requestId` - From `x-request-id` header
- `userAgent` - From `user-agent` header

### Cloudflare Workers

Example with Cloudflare Workers:

```typescript
import { z } from 'zod';
import {
  TypedLogger,
  CreateRegistry,
  DefineEvent,
  CreateStructuredSink,
  CreateAxiomDrain,
  BatchedDrain,
} from 'typedlog';

// Define context schema
const contextSchema = z.object({
  traceId: z.string(),
  requestId: z.string(),
  userId: z.string().optional(),
});

// Define events
const httpRequest = DefineEvent(
  'http.request',
  z.object({ method: z.string(), path: z.string(), status: z.number(), duration: z.number() }),
  { kind: 'log', level: 'info', require: ['traceId'] as const },
);

const apiError = DefineEvent(
  'api.error',
  z.object({ message: z.string(), stack: z.string().optional() }),
  { kind: 'log', level: 'error', require: ['traceId'] as const },
);

// Create registry
const registry = CreateRegistry(contextSchema, [httpRequest, apiError] as const);

// Create logger factory with Axiom drain for production
const axiomDrain = CreateAxiomDrain({
  dataset: 'workers',
  apiKey: process.env.AXIOM_TOKEN,
});
const batched = new BatchedDrain(axiomDrain, { batchSize: 50, flushInterval: 1000 });

const loggerFactory = TypedLogger.For(registry, {
  sinks: [CreateStructuredSink(), batched.CreateSink()],
});

// Worker handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(request.url);

    // Generate trace and request IDs
    const traceId = request.headers.get('x-trace-id') || crypto.randomUUID();
    const requestId = crypto.randomUUID();

    // Run within scoped context
    return await loggerFactory.Scoped({ traceId, requestId }, async () => {
      const logger = loggerFactory.Get();

      try {
        // Route handling
        let response: Response;

        if (url.pathname === '/api/users' && request.method === 'POST') {
          const body = await request.json();

          // Log user action with automatic context
          await logger.Emit('user.created', { email: body.email });

          response = new Response(JSON.stringify({ id: 'user_123' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          response = new Response('Not Found', { status: 404 });
        }

        // Log the request
        await logger.Emit('http.request', {
          method: request.method,
          path: url.pathname,
          status: response.status,
          duration: Date.now() - startTime,
        });

        // Ensure logs are flushed before returning
        ctx.waitUntil(batched.Flush());

        return response;
      } catch (error) {
        // Log error with context
        await logger.Emit('api.error', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Flush logs before returning error
        ctx.waitUntil(batched.Flush());

        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    });
  },
};
```

Key differences for Cloudflare Workers:

- Use `loggerFactory.Scoped()` directly in the handler (no middleware pattern)
- Use `ctx.waitUntil()` to ensure async log flushing doesn't block the response
- Workers have no `console` in production, so always use structured sinks or drains

## Event Accumulation

Build up context over time before emitting:

```typescript
const acc = logger.Accumulate();

acc
  .Set({ userId: '123' })
  .Set({ action: 'checkout' })
  .Error(new Error('Payment failed'), { step: 'validation' });

await acc.Emit('checkout.failed', { reason: 'insufficient_funds' });
// Emits with accumulated context and tracked errors
```

## Structured Errors

Create errors with context, breadcrumbs, and actionable metadata:

```typescript
import { CreateError, ParseError, TypedError } from 'typedlog';

// Create structured error
const error = CreateError({
  message: 'Payment failed',
  code: 'PAYMENT_ERROR',
  reason: 'Card declined by issuer',
  resolution: 'Try a different payment method',
  documentation: 'https://docs.example.com/errors/PAYMENT_ERROR',
});

// Add breadcrumbs to trace error flow
error
  .AddBreadcrumb('Validating card', 'payment')
  .AddBreadcrumb('Card declined', 'payment')
  .WithContext('orderId', 'order_123')
  .WithContext('amount', 99.99);

throw error;
```

### Parse Unknown Errors

Convert any error into a structured `TypedError`:

```typescript
try {
  await riskyOperation();
} catch (err) {
  const error = ParseError(err);
  // error.code, error.reason, error.resolution available
  logger.Emit('operation.failed', { error: error.ToJSON() });
}
```

### Error Properties

| Property        | Description                      |
| --------------- | -------------------------------- |
| `message`       | Human-readable error message     |
| `code`          | Machine-readable error code      |
| `reason`        | Why the error occurred           |
| `resolution`    | How to fix it                    |
| `documentation` | Link to docs                     |
| `breadcrumbs`   | Trace of events leading to error |
| `timestamp`     | When error was created           |
| `context`       | Additional key-value context     |

## Registry Export

Export event schemas for documentation or validation:

```typescript
import { ExportRegistry } from 'typedlog';

const exported = ExportRegistry(registry, '1.0.0');
// { version: '1.0.0', events: [...] }

fs.writeFileSync('registry.json', JSON.stringify(exported, null, 2));
```

## License

MIT
