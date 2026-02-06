/**
 * Core type definitions for t-log
 * @module types
 */

import type { z } from 'zod';

/**
 * Any Zod schema type
 */
export type AnyZodSchema = z.ZodType<any, any, any>;

/**
 * Event kinds supported by t-log
 * - `log`: General log events
 * - `metric`: Metrics and measurements
 * - `span`: Distributed tracing spans
 */
export type EventKind = 'log' | 'metric' | 'span';

/**
 * Log levels in order of severity
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Field tags for data governance
 * - `pii`: Personally identifiable information
 * - `secret`: Secrets and credentials
 * - `token`: Authentication tokens
 * - `sensitive`: General sensitive data
 */
export type FieldTag = 'pii' | 'secret' | 'token' | 'sensitive';

/**
 * Map of field paths to their tags
 * @example
 * ```typescript
 * { 'payload.email': 'pii', 'context.userId': 'pii' }
 * ```
 */
export type TagMap = Partial<Record<string, FieldTag | readonly FieldTag[]>>;

type Primitive = string | number | boolean | bigint | symbol | null | undefined | Date;

type IsPlainObject<T> = T extends Primitive
  ? false
  : T extends readonly unknown[]
    ? false
    : T extends object
      ? true
      : false;

export type PayloadPaths<T> = T extends object
  ? {
      [K in keyof T & string]: IsPlainObject<NonNullable<T[K]>> extends true
        ? `${K}` | `${K}.${PayloadPaths<NonNullable<T[K]>>}`
        : `${K}`;
    }[keyof T & string]
  : never;

export type PayloadTagMap<Schema extends z.ZodType> = Partial<
  Record<`payload.${PayloadPaths<z.output<Schema>>}`, FieldTag | readonly FieldTag[]>
>;

export type RegistryEventOptions<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Schema extends z.ZodType,
  Kind extends EventKind,
  Require extends readonly (keyof z.output<ContextSchema> & string)[] | undefined,
> = Omit<EventOptions<Kind, Require, TagMap | undefined>, 'require' | 'tags'> & {
  require?: Require;
  tags?: PayloadTagMap<Schema>;
};

export type RegistryBuilder<ContextSchema extends z.ZodObject<z.ZodRawShape>> = {
  DefineEvent: <
    Name extends string,
    Schema extends z.ZodType,
    Kind extends EventDefAny['kind'],
    Require extends readonly (keyof z.output<ContextSchema> & string)[] | undefined,
  >(
    name: Name,
    schema: Schema,
    options: RegistryEventOptions<ContextSchema, Schema, Kind, Require>,
  ) => EventDef<Name, Kind, Schema, Require, PayloadTagMap<Schema> | undefined>;
};

/**
 * Redaction modes for controlling field visibility
 * - `strict`: Redact all tagged fields (pii, secret, token, sensitive)
 * - `lenient`: Redact only secrets and tokens
 * - `dev`: Redact only secrets and tokens (for development)
 */
export type RedactionMode = 'strict' | 'lenient' | 'dev';

/**
 * Options for defining an event
 *
 * @template Kind - The event kind
 * @template Require - Required context keys
 * @template Tags - Field tags for governance
 */
export type EventOptions<
  Kind extends EventKind,
  Require extends readonly string[] | undefined,
  Tags extends TagMap | undefined,
> = {
  /** Event kind (log, metric, span) */
  kind: Kind;
  /** Schema version for tracking changes */
  version?: string;
  /** Log level for the event */
  level?: LogLevel;
  /** Required context keys that must be present */
  require?: Require;
  /** Field tags for PII/sensitive data redaction */
  tags?: Tags;
  /** Whether this event is deprecated */
  deprecated?: boolean;
  /** Deprecation guidance message */
  deprecationMessage?: string;
  /** Human-readable description */
  description?: string;
};

/**
 * Event definition with full type information
 *
 * @template Name - Event name (unique identifier)
 * @template Kind - Event kind
 * @template Schema - Zod schema for payload validation
 * @template Require - Required context keys
 * @template Tags - Field tags
 */
export type EventDef<
  Name extends string,
  Kind extends EventKind,
  Schema extends AnyZodSchema,
  Require extends readonly string[] | undefined,
  Tags extends TagMap | undefined,
> = {
  /** Event name (unique identifier) */
  name: Name;
  /** Event kind */
  kind: Kind;
  /** Zod schema for payload validation */
  schema: Schema;
  /** Schema fingerprint for versioning */
  fingerprint: string;
  /** Schema version */
  version?: string;
  /** Log level */
  level?: LogLevel;
  /** Required context keys */
  require?: Require;
  /** Field tags for governance */
  tags?: Tags;
  /** Whether this event is deprecated */
  deprecated?: boolean;
  /** Deprecation guidance message */
  deprecationMessage?: string;
  /** Human-readable description */
  description?: string;
};

/**
 * Any event definition (convenience type)
 */
export type EventDefAny = EventDef<
  string,
  EventKind,
  AnyZodSchema,
  readonly string[] | undefined,
  TagMap | undefined
>;

/**
 * Map of event names to their definitions
 */
export type EventsByName<Events extends readonly EventDefAny[]> = {
  [E in Events[number] as E['name']]: E;
};

/**
 * Extract event definition by name
 */
export type EventByName<Events extends readonly EventDefAny[], Name extends string> = Extract<
  Events[number],
  { name: Name }
>;

/**
 * Event envelope containing all event data
 *
 * @template Context - Context type
 * @template Payload - Payload type
 */
export type Envelope<Context, Payload> = {
  /** Event kind */
  kind: EventKind;
  /** Event name */
  name: string;
  /** ISO timestamp */
  ts: string;
  /** Schema information */
  schema: {
    /** Schema fingerprint */
    fingerprint: string;
    /** Schema version */
    version?: string;
  };
  /** Event context */
  context: Context;
  /** Event payload */
  payload: Payload;
  /** Log level */
  level?: LogLevel;
  /** Field tags */
  tags?: TagMap;
};

/**
 * Logging policy configuration
 */
export type Policy = {
  /** Tags to redact from output */
  redact?: readonly FieldTag[];
  /** Redaction mode */
  redactionMode?: RedactionMode;
  /** Sampling configuration */
  sample?: SamplingConfig;
  /** Per-event rate limiting */
  rateLimit?: RateLimitConfig;
  /** PII guardrails for payloads */
  piiGuard?: PiiGuardConfig;
};

/**
 * Internal logger error-capture event configuration.
 */
export type ErrorCaptureOptions = {
  /** Enable internal error events (default: true when object form is provided) */
  enabled?: boolean;
  /** Event name used for captured errors */
  eventName?: string;
  /** Level assigned to captured error events */
  level?: LogLevel;
  /** Include current logger context in captured events (default: true) */
  includeContext?: boolean;
  /** Include stack trace in captured payload (default: true) */
  includeStack?: boolean;
};

/**
 * Options for explicit logger error capture.
 */
export type CapturedErrorOptions = {
  /** Logical source of the captured error */
  source?: string;
  /** Additional input details to attach to payload */
  details?: Record<string, unknown>;
};

/**
 * Sampling rule for dynamic event sampling
 */
export type SamplingRule = {
  /** Match by event name */
  event?: string;
  /** Match by event kind */
  kind?: EventKind;
  /** Match by event level */
  level?: LogLevel;
  /** Sampling rate for matching events (0..1) */
  rate: number;
  /** Optional predicate for additional filtering */
  when?: (input: {
    event: string;
    kind: EventKind;
    level?: LogLevel;
    context: Record<string, unknown>;
    payload: unknown;
  }) => boolean;
};

/**
 * Sampling configuration
 */
export type SamplingConfig = {
  /** Default sampling rate (0-1) */
  rate?: number;
  /** Adaptive sampling (always keep errors) */
  adaptive?: boolean;
  /** Rule-based overrides */
  rules?: readonly SamplingRule[];
};

/**
 * Per-event rate limit rule
 */
export type RateLimitRule = {
  /** Event name this rule applies to */
  event: string;
  /** Maximum tokens in bucket */
  burst: number;
  /** Refill rate in tokens/second */
  perSecond: number;
};

/**
 * Rate limiting configuration
 */
export type RateLimitConfig = {
  /** Event-specific rules */
  rules: readonly RateLimitRule[];
  /** Behavior when rate limit is exceeded */
  onLimit?: 'drop' | 'throw';
};

/**
 * Supported PII detectors
 */
export type PiiDetector = 'email' | 'phone' | 'credit-card';

/**
 * PII finding result
 */
export type PiiFinding = {
  /** JSON path inside payload */
  path: string;
  /** Detector that matched */
  detector: PiiDetector;
  /** Redacted value preview */
  valuePreview: string;
  /** Whether field had explicit sensitivity tag */
  tagged: boolean;
};

/**
 * PII guard configuration
 */
export type PiiGuardConfig = {
  /** Guard mode */
  mode: 'warn' | 'block';
  /** Enabled detectors (default: all) */
  detectors?: readonly PiiDetector[];
  /** Only flag sensitive values without tags (default: true) */
  requireTags?: boolean;
};

/**
 * Trace context metadata
 */
export type TraceContext = {
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
  traceparent?: string;
};

/**
 * Context enricher input
 */
export type ContextEnricherInput<Context> = {
  name: string;
  kind: EventKind;
  level?: LogLevel;
  ts: string;
  context: Partial<Context>;
  payload: unknown;
};

/**
 * Context enricher callback
 */
export type ContextEnricher<Context> = (
  input: ContextEnricherInput<Context>,
) => Partial<Context> | void;

/**
 * Tracing integration options
 */
export type TracingOptions<Context> = {
  /** Tracing provider identifier */
  provider?: 'opentelemetry';
  /** Inject trace metadata into context */
  injectTraceContext?: boolean;
  /** Custom trace context resolver */
  GetTraceContext?: () => TraceContext | undefined;
  /** Optional mapper from trace context to logger context */
  MapTraceContext?: (traceContext: TraceContext) => Partial<Context>;
};

/**
 * Sink function for processing events
 */
export type Sink<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Memory sink with captured events for testing
 */
export type MemorySink<Context, Payload> = Sink<Envelope<Context, Payload>> & {
  events: Envelope<Context, Payload>[];
};

/**
 * Drain handle with a sink and flush capability
 */
export type DrainHandle<Context, Payload> = {
  Sink: Sink<Envelope<Context, Payload>>;
  Flush: () => Promise<void>;
};

/**
 * Context manager for async context propagation
 */
export type ContextManager<Context> = {
  /** Context schema */
  schema: z.ZodObject<z.ZodRawShape>;
  /** Run function with context */
  Run: <Result>(context: Context, fn: () => Result) => Result;
  /** Run function with additional context */
  With: <Result>(context: Partial<Context>, fn: () => Result) => Result;
  /** Get current context */
  Get: () => Context | undefined;
};

/**
 * Event registry containing all event definitions
 */
export type Registry<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
> = {
  /** Context schema */
  contextSchema: ContextSchema;
  /** All event definitions */
  events: Events;
  /** Events indexed by name */
  eventsByName: EventsByName<Events>;
  /** Get event by name */
  Get: <Name extends keyof EventsByName<Events>>(name: Name) => EventsByName<Events>[Name];
  /** Define event with context-aware tags */
  DefineEvent: RegistryBuilder<ContextSchema>['DefineEvent'];
};

/**
 * Exported registry format
 */
export type RegistryExport = {
  /** Registry version */
  version: string;
  /** Event exports */
  events: EventDefExport[];
};

/**
 * Exported event definition
 */
export type EventDefExport = {
  /** Event name */
  name: string;
  /** Event kind */
  kind: EventKind;
  /** Schema fingerprint */
  fingerprint: string;
  /** Schema version */
  schemaVersion?: string;
  /** Log level */
  level?: LogLevel;
  /** Required context keys */
  require?: readonly string[];
  /** Field tags */
  tags?: TagMap;
  /** Whether this event is deprecated */
  deprecated?: boolean;
  /** Deprecation guidance message */
  deprecationMessage?: string;
  /** Description */
  description?: string;
  /** JSON Schema representation */
  jsonSchema: unknown;
};

/**
 * Error domains emitted by t-log.
 */
export type ErrorDomain =
  | 'registry'
  | 'logger'
  | 'typed-logger'
  | 'context'
  | 'framework'
  | 'drain'
  | 'integration'
  | 'unknown';

/**
 * Stable error codes emitted by t-log.
 */
export type ErrorCode =
  | 'REGISTRY_DUPLICATE_EVENT'
  | 'LOGGER_UNKNOWN_EVENT'
  | 'LOGGER_INVALID_PAYLOAD'
  | 'LOGGER_INVALID_CONTEXT'
  | 'LOGGER_MISSING_REQUIRED_CONTEXT'
  | 'LOGGER_RATE_LIMIT_EXCEEDED'
  | 'LOGGER_PII_GUARD_BLOCKED'
  | 'TYPED_LOGGER_NO_SCOPE'
  | 'TYPED_LOGGER_UNKNOWN_EVENT'
  | 'SIMULATION_INVALID_INPUT'
  | 'CONTEXT_INVALID'
  | 'DRAIN_HTTP_FAILURE'
  | 'DRAIN_TIMEOUT'
  | 'DRAIN_CONFIGURATION_MISSING'
  | 'INTEGRATION_INVALID_CONTEXT'
  | 'UNKNOWN_ERROR';

/**
 * Error context for structured errors
 */
export type ErrorContext = {
  /** Error message */
  message: string;
  /** Error code */
  code?: ErrorCode | string;
  /** Error domain */
  domain?: ErrorDomain;
  /** Why the error occurred */
  reason?: string;
  /** How to fix the error */
  resolution?: string;
  /** Link to documentation */
  documentation?: string;
  /** Error breadcrumbs */
  breadcrumbs?: Breadcrumb[];
  /** Additional structured details */
  details?: Record<string, unknown>;
  /** Original error cause */
  cause?: unknown;
  /** Whether retrying can help */
  retryable?: boolean;
  /** Optional status code */
  statusCode?: number;
};

/**
 * Error breadcrumb for tracing error flow
 */
export type Breadcrumb = {
  /** Breadcrumb message */
  message: string;
  /** Timestamp */
  timestamp: number;
  /** Category (e.g., 'db', 'api', 'auth') */
  category?: string;
};

/**
 * Drain function for external observability platforms
 */
export type Drain = <Context, Payload>(
  events: Envelope<Context, Payload>[],
) => Promise<void> | void;

/**
 * Retry jitter strategy
 */
export type DrainRetryJitter = 'none' | 'full';

/**
 * Retry configuration for drain delivery
 */
export type DrainRetryConfig = {
  /** Maximum attempts including the first one (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds for exponential backoff (default: 100) */
  baseDelayMs?: number;
  /** Maximum backoff delay in milliseconds (default: 3000) */
  maxDelayMs?: number;
  /** Jitter strategy for retry delays (default: 'none') */
  jitter?: DrainRetryJitter;
  /** Per-attempt timeout in milliseconds */
  perAttemptTimeoutMs?: number;
};

/**
 * Queue strategy when buffered events hit capacity
 */
export type DrainQueueStrategy = 'drop-oldest' | 'drop-newest' | 'block' | 'sample';

/**
 * Queue configuration for batched drains
 */
export type DrainQueueConfig = {
  /** Maximum buffered events before applying strategy */
  maxItems?: number;
  /** Strategy to apply when queue is full (default: 'drop-newest') */
  strategy?: DrainQueueStrategy;
  /** Keep rate when strategy is 'sample' (0..1, default: 0.5) */
  sampleRate?: number;
};

/**
 * Telemetry event emitted by drain internals
 */
export type DrainTelemetryEvent = {
  /** Metric name */
  metric: string;
  /** Metric value */
  value: number;
  /** ISO timestamp */
  ts: string;
  /** Metric tags */
  tags?: Record<string, string>;
};

/**
 * Telemetry configuration for drains
 */
export type DrainTelemetryConfig = {
  /** Sink receiving telemetry metrics */
  sink: Sink<DrainTelemetryEvent>;
  /** Optional metric prefix (default: 't-log.drain') */
  prefix?: string;
  /** Static tags attached to every metric */
  tags?: Record<string, string>;
};

/**
 * Failed drain batch payload
 */
export type DrainFailure<Context = unknown, Payload = unknown> = {
  /** Failure reason */
  reason: string;
  /** Attempts performed */
  attempts: number;
  /** Failure timestamp */
  failedAt: string;
  /** Failed events */
  events: Envelope<Context, Payload>[];
  /** Optional error message */
  error?: string;
};

/**
 * Replay options for dead-letter sources
 */
export type DrainReplayOptions = {
  /** Max events per second */
  maxPerSecond?: number;
};

/**
 * Replay result summary
 */
export type DrainReplayResult = {
  /** Number of replayed events */
  replayed: number;
  /** Number of failed batches */
  failed: number;
};

/**
 * Datadog site identifier
 */
export type DatadogSite = 'us1' | 'us3' | 'us5' | 'eu1' | 'ap1' | 'ap2' | 'us1-fed';

/**
 * Configuration for drains
 */
export type DrainConfig = {
  /** API endpoint */
  endpoint?: string;
  /** API key */
  apiKey?: string;
  /** Dataset name */
  dataset?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Batch size for batching */
  batchSize?: number;
  /** Flush interval in ms */
  flushInterval?: number;
  /** Retry configuration */
  retry?: DrainRetryConfig;
  /** Queue backpressure configuration */
  queue?: DrainQueueConfig;
  /** Delivery telemetry configuration */
  telemetry?: DrainTelemetryConfig;
  /** Sink receiving permanently failed batches */
  deadLetterSink?: Sink<DrainFailure<unknown, unknown>>;
};

/**
 * Datadog drain configuration
 */
export type DatadogDrainConfig = {
  /** Explicit Datadog logs endpoint */
  endpoint?: string;
  /** Datadog API key */
  apiKey?: string;
  /** Datadog site (used when endpoint is not provided) */
  site?: DatadogSite;
  /** Service name attached to each log */
  service?: string;
  /** Hostname attached to each log */
  host?: string;
  /** Datadog tags, either comma-separated or list */
  tags?: string | readonly string[];
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Batch size for batching */
  batchSize?: number;
  /** Flush interval in ms */
  flushInterval?: number;
  /** Retry configuration */
  retry?: DrainRetryConfig;
  /** Queue backpressure configuration */
  queue?: DrainQueueConfig;
  /** Delivery telemetry configuration */
  telemetry?: DrainTelemetryConfig;
  /** Sink receiving permanently failed batches */
  deadLetterSink?: Sink<DrainFailure<unknown, unknown>>;
};

/**
 * Loki basic auth credentials
 */
export type LokiBasicAuth = {
  /** Loki username */
  username: string;
  /** Loki password */
  password: string;
};

/**
 * Loki drain configuration
 */
export type LokiDrainConfig = {
  /** Loki push endpoint */
  endpoint?: string;
  /** Bearer token for authentication */
  bearerToken?: string;
  /** Basic auth credentials */
  basicAuth?: LokiBasicAuth;
  /** Multi-tenant org identifier */
  tenantId?: string;
  /** Static labels attached to each stream */
  labels?: Record<string, string>;
  /** Include event name label on each stream */
  includeEventNameLabel?: boolean;
  /** Service label value */
  service?: string;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Batch size for batching */
  batchSize?: number;
  /** Flush interval in ms */
  flushInterval?: number;
  /** Retry configuration */
  retry?: DrainRetryConfig;
  /** Queue backpressure configuration */
  queue?: DrainQueueConfig;
  /** Delivery telemetry configuration */
  telemetry?: DrainTelemetryConfig;
  /** Sink receiving permanently failed batches */
  deadLetterSink?: Sink<DrainFailure<unknown, unknown>>;
};

/**
 * Better Stack drain configuration
 */
export type BetterStackDrainConfig = {
  /** Better Stack ingest endpoint */
  endpoint?: string;
  /** Better Stack source token */
  sourceToken?: string;
  /** Service metadata attached to each log */
  service?: string;
  /** Host metadata attached to each log */
  host?: string;
  /** Source metadata attached to each log */
  source?: string;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Batch size for batching */
  batchSize?: number;
  /** Flush interval in ms */
  flushInterval?: number;
  /** Retry configuration */
  retry?: DrainRetryConfig;
  /** Queue backpressure configuration */
  queue?: DrainQueueConfig;
  /** Delivery telemetry configuration */
  telemetry?: DrainTelemetryConfig;
  /** Sink receiving permanently failed batches */
  deadLetterSink?: Sink<DrainFailure<unknown, unknown>>;
};

/**
 * Registry compatibility issue
 */
export type RegistryCompatibilityIssue = {
  event: string;
  type:
    | 'added'
    | 'removed'
    | 'kind-changed'
    | 'fingerprint-changed'
    | 'fingerprint-without-version-bump';
  message: string;
};

/**
 * Registry compatibility report
 */
export type RegistryCompatibilityReport = {
  compatible: boolean;
  issues: RegistryCompatibilityIssue[];
};

/**
 * Policy simulation result
 */
export type PolicySimulationResult<Context = unknown, Payload = unknown> = {
  accepted: boolean;
  warnings: string[];
  piiFindings: PiiFinding[];
  envelope?: Envelope<Context, Payload>;
  redacted?: Envelope<Context, Payload>;
};

/**
 * Request context for HTTP frameworks
 */
export type RequestContext = {
  /** HTTP method */
  method?: string;
  /** Request path */
  path?: string;
  /** Request ID */
  requestId?: string;
  /** User agent */
  userAgent?: string;
  /** Client IP */
  ip?: string;
  /** Additional context */
  [key: string]: unknown;
};
