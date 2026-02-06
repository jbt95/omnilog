/**
 * @packageDocumentation
 *
 * # OmniLog
 *
 * Schema-first, type-safe structured logging and observability for TypeScript.
 *
 * ## Features
 *
 * - **Schema-first**: Define events with Zod schemas for runtime validation
 * - **Type-safe**: Full TypeScript inference from schema definitions
 * - **Context propagation**: Async context for request-scoped logging
 * - **Field-level governance**: PII redaction, secret masking with tags
 * - **Runtime controls**: Dynamic sampling, rate limits, and policy simulation
 * - **Granular structured errors**: Stable error codes/domains for troubleshooting and control flow
 * - **Observability drains**: Built-in Axiom/OTLP/webhook/datadog/loki/better stack sink handles with retry/backpressure
 * - **Integrations**: Native middleware and handler helpers for major runtimes
 *
 * ## Quick Start
 *
 * ```typescript
 * import { z } from 'zod';
 * import { OmniLogger, Registry, Sink } from 'omnilog';
 *
 * // Define your context schema
 * const contextSchema = z.object({
 *   traceId: z.string(),
 *   userId: z.string(),
 * });
 *
 * const registry = Registry.Create(contextSchema, (registry) => [
 *   registry.DefineEvent('user.login', z.object({ userId: z.string(), email: z.string().email() }), {
 *     kind: 'log',
 *     level: 'info',
 *     require: ['traceId'] as const,
 *     tags: { 'payload.email': 'pii' },
 *   }),
 * ] as const);
 *
 * const loggerFactory = OmniLogger.For(registry, {
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

import {
  CreateContext,
  CreateRuntimeEnricher,
  CreateRegionEnricher,
  CreateRequestHeadersEnricher,
} from './context.js';
import { SchemaFingerprint } from './fingerprint.js';
import { CreateRegistry, ExportRegistry, CompareRegistry } from './registry.js';
import {
  CreateMemorySink,
  CreateVisualSink,
  CreateStructuredSink,
  CreateEnvironmentSink,
} from './sinks.js';
import { CreateDomainError, CreateError, ParseError, OmniError } from './error.js';
import { ApplyRedaction, CreateRedactionPolicy } from './redaction.js';
import {
  CreateAxiomSink,
  CreateOTLPSink,
  CreateWebhookSink,
  CreateDatadogSink,
  CreateLokiSink,
  CreateBetterStackSink,
  CreateDeadLetterFileSink,
  CreateFileSource,
  CreateFingerprint,
} from './drains.js';
import { CreateExpressMiddleware } from './integrations/express.js';
import { CreateHonoMiddleware } from './integrations/hono.js';
import { CreateLambdaHandler } from './integrations/aws-lambda.js';
import { CreateWorkerHandler } from './integrations/cloudflare-workers.js';
import { CreateRequestContext, ExtractRequestContext, AutoFlush } from './framework.js';

export class Registry {
  static Create: typeof CreateRegistry = CreateRegistry;
  static Export: typeof ExportRegistry = ExportRegistry;
  static Compare: typeof CompareRegistry = CompareRegistry;
  static SchemaFingerprint: typeof SchemaFingerprint = SchemaFingerprint;
}

export class Sink {
  static Memory: typeof CreateMemorySink = CreateMemorySink;
  static Visual: typeof CreateVisualSink = CreateVisualSink;
  static Structured: typeof CreateStructuredSink = CreateStructuredSink;
  static Environment: typeof CreateEnvironmentSink = CreateEnvironmentSink;
}

export class Drain {
  static AxiomSink: typeof CreateAxiomSink = CreateAxiomSink;
  static OTLPSink: typeof CreateOTLPSink = CreateOTLPSink;
  static WebhookSink: typeof CreateWebhookSink = CreateWebhookSink;
  static DatadogSink: typeof CreateDatadogSink = CreateDatadogSink;
  static LokiSink: typeof CreateLokiSink = CreateLokiSink;
  static BetterStackSink: typeof CreateBetterStackSink = CreateBetterStackSink;
  static DeadLetterFile: typeof CreateDeadLetterFileSink = CreateDeadLetterFileSink;
  static FileSource: typeof CreateFileSource = CreateFileSource;
  static Fingerprint: typeof CreateFingerprint = CreateFingerprint;
}

export class Error {
  static Create: typeof CreateError = CreateError;
  static Parse: typeof ParseError = ParseError;
  static Omni: typeof OmniError = OmniError;
  static Domain: typeof CreateDomainError = CreateDomainError;
}

export class Redaction {
  static Apply: typeof ApplyRedaction = ApplyRedaction;
  static Policy: typeof CreateRedactionPolicy = CreateRedactionPolicy;
}

export class Context {
  static Create: typeof CreateContext = CreateContext;
  static Runtime: typeof CreateRuntimeEnricher = CreateRuntimeEnricher;
  static Region: typeof CreateRegionEnricher = CreateRegionEnricher;
  static RequestHeaders: typeof CreateRequestHeadersEnricher = CreateRequestHeadersEnricher;
  static Request: typeof CreateRequestContext = CreateRequestContext;
  static Extract: typeof ExtractRequestContext = ExtractRequestContext;
  static AutoFlush: typeof AutoFlush = AutoFlush;
}

export class Middleware {
  static Express: typeof CreateExpressMiddleware = CreateExpressMiddleware;
  static Hono: typeof CreateHonoMiddleware = CreateHonoMiddleware;
}

export class Handler {
  static Lambda: typeof CreateLambdaHandler = CreateLambdaHandler;
  static Worker: typeof CreateWorkerHandler = CreateWorkerHandler;
}

export { OmniLogger } from './omni-logger.js';
export { OmniLogModule } from './integrations/nestjs.js';

export type {
  ContextEnricher,
  ContextEnricherInput,
  ContextManager,
  DrainFailure,
  Envelope,
  ErrorCaptureOptions,
  ErrorCode,
  ErrorDomain,
  ErrorContext,
  Breadcrumb,
  CapturedErrorOptions,
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
  DatadogSite,
  DatadogDrainConfig,
  LokiBasicAuth,
  LokiDrainConfig,
  BetterStackDrainConfig,
  DrainConfig,
  DrainQueueConfig,
  DrainQueueStrategy,
  DrainHandle,
  DrainReplayOptions,
  DrainReplayResult,
  DrainRetryConfig,
  DrainRetryJitter,
  DrainTelemetryConfig,
  DrainTelemetryEvent,
  PiiDetector,
  PiiFinding,
  PiiGuardConfig,
  PolicySimulationResult,
  RequestContext,
  RateLimitConfig,
  RateLimitRule,
  RegistryCompatibilityIssue,
  RegistryCompatibilityReport,
  SamplingConfig,
  SamplingRule,
  TraceContext,
  TracingOptions,
  MemorySink,
} from './types.js';

export type { LoggerFactory, LoggerSimulationOptions } from './omni-logger.js';
export type { IntegrationOptions } from './integrations/integration-options.js';
export type { OmniLogModuleOptions } from './integrations/nestjs.js';
