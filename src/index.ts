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
 * import { TypedLogger, CreateRegistry, DefineEvent, CreateEnvironmentSink } from 'typedlog';
 * 
 * // Define your context schema
 * const contextSchema = z.object({
 *   traceId: z.string(),
 *   userId: z.string(),
 * });
 * 
 * // Define events with schemas
 * const userLogin = DefineEvent(
 *   'user.login',
 *   z.object({ userId: z.string(), email: z.string().email() }),
 *   {
 *     kind: 'log',
 *     level: 'info',
 *     require: ['traceId'] as const,
 *     tags: { 'payload.email': 'pii' },
 *   }
 * );
 * 
 * // Create registry and logger
 * const registry = CreateRegistry(contextSchema, [userLogin] as const);
 * const loggerFactory = TypedLogger.For(registry, {
 *   sinks: [CreateEnvironmentSink()],
 *   policy: { redact: ['pii'] },
 * });
 * 
 * // Use the logger
 * await loggerFactory.Scoped({ traceId: 'abc', userId: '123' }, async () => {
 *   const logger = loggerFactory.Get();
 *   await logger.Emit('user.login', { userId: '123', email: 'user@example.com' });
 * });
 * ```
 * 
 * @module
 */

export { CreateContext } from './context.js';
export { SchemaFingerprint } from './fingerprint.js';
export { DefineEvent, CreateRegistry, ExportRegistry } from './registry.js';
export {
  CreateMemorySink,
  CreateVisualSink,
  CreateStructuredSink,
  CreateEnvironmentSink,
} from './sinks.js';
export { CreateError, ParseError, TypedError } from './error.js';
export { ApplyRedaction, CreateRedactionPolicy } from './redaction.js';
export {
  CreateAxiomDrain,
  CreateOTLPDrain,
  CreateWebhookDrain,
  BatchedDrain,
  CreateFingerprint,
} from './drains.js';
export {
  CreateRequestContext,
  ExtractRequestContext,
  AutoFlush,
} from './framework.js';
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
  Registry,
  RegistryExport,
  Sink,
  TagMap,
  Drain,
  DrainConfig,
  RequestContext,
} from './types.js';

export type { LoggerFactory } from './typed-logger.js';
