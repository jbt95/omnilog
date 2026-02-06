/**
 * Structured error handling with breadcrumbs, domains, and stable codes
 * @module error
*/

import type { ErrorContext, Breadcrumb } from './types.js';
import type { ErrorCode, ErrorDomain } from './types.js';

/**
 * Structured error class with breadcrumbs and metadata
 *
 * @example
 * ```typescript
 * const error = CreateError({
 *   message: 'Payment failed',
 *   code: 'PAYMENT_ERROR',
 *   reason: 'Card declined',
 *   resolution: 'Try a different card',
 * });
 *
 * error
 *   .AddBreadcrumb('Validating card', 'payment')
 *   .AddBreadcrumb('Card declined', 'payment');
 *
 * throw error;
 * ```
 */
export class TypedError extends Error {
  /** Error code */
  readonly code?: string;
  /** Error domain */
  readonly domain?: ErrorDomain;
  /** Why the error occurred */
  readonly reason?: string;
  /** How to fix it */
  readonly resolution?: string;
  /** Link to documentation */
  readonly documentation?: string;
  /** Additional structured details */
  readonly details?: Record<string, unknown>;
  /** Original error cause */
  override readonly cause?: unknown;
  /** Whether retrying can help */
  readonly retryable?: boolean;
  /** Optional status code */
  readonly statusCode?: number;
  /** Error breadcrumbs */
  readonly breadcrumbs: Breadcrumb[];
  /** Timestamp when error was created */
  readonly timestamp: number;
  /** Additional context */
  readonly context: Record<string, unknown>;

  constructor(context: ErrorContext) {
    super(context.message, context.cause !== undefined ? { cause: context.cause } : undefined);
    this.name = 'TypedError';
    if (context.code !== undefined) {
      (this as Record<string, unknown>).code = context.code;
    }
    if (context.domain !== undefined) {
      (this as Record<string, unknown>).domain = context.domain;
    }
    if (context.reason !== undefined) {
      (this as Record<string, unknown>).reason = context.reason;
    }
    if (context.resolution !== undefined) {
      (this as Record<string, unknown>).resolution = context.resolution;
    }
    if (context.documentation !== undefined) {
      (this as Record<string, unknown>).documentation = context.documentation;
    }
    if (context.details !== undefined) {
      (this as Record<string, unknown>).details = context.details;
    }
    if (context.cause !== undefined) {
      (this as Record<string, unknown>).cause = context.cause;
    }
    if (context.retryable !== undefined) {
      (this as Record<string, unknown>).retryable = context.retryable;
    }
    if (context.statusCode !== undefined) {
      (this as Record<string, unknown>).statusCode = context.statusCode;
    }
    this.breadcrumbs = context.breadcrumbs ?? [];
    this.timestamp = Date.now();
    this.context = {};
  }

  /**
   * Add a breadcrumb to trace error flow
   * @param message - Breadcrumb message
   * @param category - Category (e.g., 'db', 'api', 'auth')
   * @returns this for chaining
   */
  AddBreadcrumb(message: string, category?: string): this {
    const crumb: Breadcrumb = {
      message,
      timestamp: Date.now(),
    };
    if (category !== undefined) {
      crumb.category = category;
    }
    this.breadcrumbs.push(crumb);
    return this;
  }

  /**
   * Add context data to the error
   * @param key - Context key
   * @param value - Context value
   * @returns this for chaining
   */
  WithContext(key: string, value: unknown): this {
    this.context[key] = value;
    return this;
  }

  /**
   * Convert error to JSON
   * @returns Plain object representation
   */
  ToJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      domain: this.domain,
      reason: this.reason,
      resolution: this.resolution,
      documentation: this.documentation,
      details: this.details,
      retryable: this.retryable,
      statusCode: this.statusCode,
      breadcrumbs: this.breadcrumbs,
      timestamp: this.timestamp,
      context: this.context,
    };
  }

  /**
   * JSON serialization hook
   */
  toJSON(): Record<string, unknown> {
    return this.ToJSON();
  }
}

/**
 * Create a structured error
 *
 * @param context - Error context with message, code, reason, etc.
 * @returns TypedError instance
 *
 * @example
 * ```typescript
 * throw CreateError({
 *   message: 'Database connection failed',
 *   code: 'DB_ERROR',
 *   reason: 'Connection timeout',
 *   resolution: 'Check database status',
 * });
 * ```
 */
export function CreateError(context: ErrorContext): TypedError {
  return new TypedError(context);
}

/**
 * Create a typed error for a specific domain and code.
 *
 * @example
 * ```typescript
 * throw CreateDomainError('logger', 'LOGGER_UNKNOWN_EVENT', 'Unknown event: order.created');
 * ```
 */
export function CreateDomainError(
  domain: ErrorDomain,
  code: ErrorCode,
  message: string,
  options: Omit<ErrorContext, 'message' | 'code' | 'domain'> = {},
): TypedError {
  return new TypedError({
    message,
    code,
    domain,
    ...options,
  });
}

/**
 * Parse any error into a TypedError
 *
 * @param error - Error to parse
 * @returns TypedError with structured information
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   const error = ParseError(err);
 *   console.log(error.code); // 'UNKNOWN_ERROR' or custom code
 * }
 * ```
 */
export function ParseError(error: unknown): TypedError {
  if (error instanceof TypedError) {
    return error;
  }

  if (error instanceof Error) {
    const data = error as Error & { code?: unknown; domain?: unknown };
    const code = typeof data.code === 'string' ? data.code : 'UNKNOWN_ERROR';
    const domain = typeof data.domain === 'string' ? data.domain : 'unknown';
    return new TypedError({
      message: error.message,
      code,
      domain: domain as ErrorDomain,
      reason: 'An unexpected error occurred',
      resolution: 'Check the error details and try again',
      cause: error,
    });
  }

  if (typeof error === 'object' && error !== null) {
    const data = error as Record<string, unknown>;
    const message = typeof data.message === 'string' ? data.message : String(error);
    const code = typeof data.code === 'string' ? data.code : 'UNKNOWN_ERROR';
    const domain = typeof data.domain === 'string' ? data.domain : 'unknown';
    const reason =
      typeof data.reason === 'string' ? data.reason : 'An unexpected error occurred';
    const resolution =
      typeof data.resolution === 'string'
        ? data.resolution
        : 'Check the error details and try again';

    return new TypedError({
      message,
      code,
      domain: domain as ErrorDomain,
      reason,
      resolution,
      cause: error,
    });
  }

  return new TypedError({
    message: String(error),
    code: 'UNKNOWN_ERROR',
    domain: 'unknown',
    reason: 'An unexpected error occurred',
    resolution: 'Check the error details and try again',
  });
}
