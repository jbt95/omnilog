/**
 * @packageDocumentation
 * 
 * # typedlog
 * 
 * Schema-first, type-safe structured logging and observability for TypeScript.
 * 
 * ## Features
 * 
 * - **Schema-first**: Define events with Zod schemas for runtime validation
 * - **Type-safe**: Full TypeScript inference from schema definitions
 * - **Context propagation**: Async context for request-scoped logging
 * - **Field-level governance**: PII redaction, secret masking with tags
 * - **Multiple sinks**: Visual (dev), structured (prod), memory (testing)
 * - **Observability drains**: Built-in Axiom, OTLP, and webhook support
 * 
 * ## Quick Start
 * 
 * ```typescript
 * import { z } from 'zod';
 * import { TypedLogger, Sink } from 'typedlog';
 * 
 * // Define your context schema
 * const contextSchema = z.object({
 *   traceId: z.string(),
 *   userId: z.string(),
 * });
 * 
 * const loggerFactory = TypedLogger.Create({
 *   contextSchema,
 *   events: (registry) => [
 *     registry.DefineEvent(
 *       'user.login',
 *       z.object({ userId: z.string(), email: z.string().email() }),
 *       {
 *         kind: 'log',
 *         level: 'info',
 *         require: ['traceId'] as const,
 *         tags: { 'payload.email': 'pii' },
 *       },
 *     ),
 *   ] as const,
 *   sinks: [Sink.Environment()],
 *   policy: { redact: ['pii'] },
 * });
 * 
 * // Use the logger
 * await loggerFactory.Scoped({ traceId: 'abc', userId: '123' }, (logger) => {
 *   logger.Emit('user.login', { userId: '123', email: 'user@example.com' });
 * });
 * ```
 * 
 * @module
 */

import { CreateContext } from './context.js';
import { SchemaFingerprint } from './fingerprint.js';
import { CreateRegistry, ExportRegistry } from './registry.js';
import {
  CreateMemorySink,
  CreateVisualSink,
  CreateStructuredSink,
  CreateEnvironmentSink,
} from './sinks.js';
import { CreateError, ParseError, TypedError } from './error.js';
import { ApplyRedaction, CreateRedactionPolicy } from './redaction.js';
import {
  CreateAxiomDrain,
  CreateOTLPDrain,
  CreateWebhookDrain,
  CreateAxiomSink,
  CreateOTLPSink,
  CreateWebhookSink,
  BatchedDrain,
  CreateFingerprint,
} from './drains.js';
import {
  CreateRequestContext,
  ExtractRequestContext,
  AutoFlush,
} from './framework.js';

export class Registry {
  static Create: typeof CreateRegistry = CreateRegistry;
  static Export: typeof ExportRegistry = ExportRegistry;
  static SchemaFingerprint: typeof SchemaFingerprint = SchemaFingerprint;
}

export class Sink {
  static Memory: typeof CreateMemorySink = CreateMemorySink;
  static Visual: typeof CreateVisualSink = CreateVisualSink;
  static Structured: typeof CreateStructuredSink = CreateStructuredSink;
  static Environment: typeof CreateEnvironmentSink = CreateEnvironmentSink;
}

export class Drain {
  static Axiom: typeof CreateAxiomDrain = CreateAxiomDrain;
  static OTLP: typeof CreateOTLPDrain = CreateOTLPDrain;
  static Webhook: typeof CreateWebhookDrain = CreateWebhookDrain;
  static AxiomSink: typeof CreateAxiomSink = CreateAxiomSink;
  static OTLPSink: typeof CreateOTLPSink = CreateOTLPSink;
  static WebhookSink: typeof CreateWebhookSink = CreateWebhookSink;
  static Batched: typeof BatchedDrain = BatchedDrain;
  static Fingerprint: typeof CreateFingerprint = CreateFingerprint;
}

export class Error {
  static Create: typeof CreateError = CreateError;
  static Parse: typeof ParseError = ParseError;
  static Typed: typeof TypedError = TypedError;
}

export class Redaction {
  static Apply: typeof ApplyRedaction = ApplyRedaction;
  static Policy: typeof CreateRedactionPolicy = CreateRedactionPolicy;
}

export class Context {
  static Create: typeof CreateContext = CreateContext;
  static Request: typeof CreateRequestContext = CreateRequestContext;
  static Extract: typeof ExtractRequestContext = ExtractRequestContext;
  static AutoFlush: typeof AutoFlush = AutoFlush;
}
export { TypedLogger } from './typed-logger.js';

export type {
  ContextManager,
  Envelope,
  ErrorContext,
  Breadcrumb,
  EventDef,
  EventDefExport,
  EventKind,
  EventOptions,
  FieldTag,
  LogLevel,
  Policy,
  RedactionMode,
  Registry as RegistryType,
  RegistryExport,
  Sink as SinkType,
  TagMap,
  Drain as DrainType,
  DrainConfig,
  DrainHandle,
  RequestContext,
  MemorySink,
} from './types.js';

export type { LoggerCreateOptions, LoggerFactory } from './typed-logger.js';
