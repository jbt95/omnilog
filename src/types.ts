/**
 * Core type definitions for typedlog
 * @module types
 */

import type { z } from 'zod';

/**
 * Any Zod schema type
 */
export type AnyZodSchema = z.ZodType<any, any, any>;

/**
 * Event kinds supported by typedlog
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
export type TagMap = Record<string, FieldTag | readonly FieldTag[]>;

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
  sample?: {
    /** Sampling rate (0-1) */
    rate: number;
    /** Adaptive sampling (always keep errors) */
    adaptive?: boolean;
  };
};

/**
 * Sink function for processing events
 */
export type Sink<T = unknown> = (event: T) => void | Promise<void>;

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
export type Registry<ContextSchema extends z.ZodObject<z.ZodRawShape>, Events extends readonly EventDefAny[]> = {
  /** Context schema */
  contextSchema: ContextSchema;
  /** All event definitions */
  events: Events;
  /** Events indexed by name */
  eventsByName: EventsByName<Events>;
  /** Get event by name */
  Get: <Name extends keyof EventsByName<Events>>(name: Name) => EventsByName<Events>[Name];
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
  /** Description */
  description?: string;
  /** JSON Schema representation */
  jsonSchema: unknown;
};

/**
 * Error context for structured errors
 */
export type ErrorContext = {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Why the error occurred */
  reason?: string;
  /** How to fix the error */
  resolution?: string;
  /** Link to documentation */
  documentation?: string;
  /** Error breadcrumbs */
  breadcrumbs?: Breadcrumb[];
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
