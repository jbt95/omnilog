/**
 * Framework integration utilities for HTTP servers
 * @module framework
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { ContextManager } from './types.js';
import { CreateDomainError } from './error.js';

/**
 * Request context extracted from HTTP requests
 */
export type RequestContext = {
  /** HTTP method (GET, POST, etc.) */
  method?: string;
  /** Request path */
  path?: string;
  /** Request ID from headers */
  requestId?: string;
  /** User agent string */
  userAgent?: string;
  /** Client IP address */
  ip?: string;
  /** Additional custom context */
  [key: string]: unknown;
};

/**
 * Create a context manager for HTTP frameworks
 *
 * Extends the base context manager with request-specific fields.
 *
 * @param schema - Zod schema for validating custom context
 * @returns Context manager with request context support
 *
 * @example
 * ```typescript
 * const context = CreateRequestContext(z.object({
 *   userId: z.string(),
 * }));
 *
 * // In your HTTP handler
 * app.use((req, res, next) => {
 *   const requestContext = ExtractRequestContext(req);
 *   context.Run({ ...requestContext, userId: '123' }, next);
 * });
 * ```
 */
export function CreateRequestContext<Schema extends z.ZodObject<z.ZodRawShape>>(
  schema: Schema,
): ContextManager<z.output<Schema> & RequestContext> {
  const storage = new AsyncLocalStorage<z.output<Schema> & RequestContext>();

  function Parse(input: unknown): z.output<Schema> & RequestContext {
    const result = schema.safeParse(input);

    if (!result.success) {
      throw CreateDomainError('framework', 'CONTEXT_INVALID', 'Invalid context', {
        reason: result.error.message,
        resolution: 'Provide request context that matches the supplied schema.',
      });
    }

    return result.data as z.output<Schema> & RequestContext;
  }

  return {
    schema,
    Run: <Result>(context: z.output<Schema> & RequestContext, fn: () => Result) =>
      storage.run(Parse(context), fn),
    With: <Result>(context: Partial<z.output<Schema> & RequestContext>, fn: () => Result) => {
      const current = storage.getStore() ?? ({} as z.output<Schema> & RequestContext);
      const merged = { ...current, ...context } as z.output<Schema> & RequestContext;
      return storage.run(Parse(merged), fn);
    },
    Get: () => storage.getStore(),
  };
}

/**
 * Extract request context from a standard Request object
 *
 * @param request - Fetch API Request object
 * @returns Request context with method, path, headers
 *
 * @example
 * ```typescript
 * const request = new Request('https://api.example.com/users', {
 *   method: 'POST',
 *   headers: { 'x-request-id': 'abc-123' },
 * });
 *
 * const context = ExtractRequestContext(request);
 * // { method: 'POST', path: '/users', requestId: 'abc-123' }
 * ```
 */
export function ExtractRequestContext(request: Request): RequestContext {
  const url = new URL(request.url);
  const context: RequestContext = {
    method: request.method,
    path: url.pathname,
  };
  const requestId = request.headers.get('x-request-id');
  if (requestId !== null) {
    context.requestId = requestId;
  }
  const userAgent = request.headers.get('user-agent');
  if (userAgent !== null) {
    context.userAgent = userAgent;
  }
  return context;
}

/**
 * Add auto-flush capability to an object
 *
 * Adds `Symbol.asyncDispose` and `dispose()` method for automatic cleanup.
 * Useful for ensuring logs are flushed before process exit.
 *
 * @param target - Object with optional flush method
 * @returns Enhanced object with disposal capability
 *
 * @example
 * ```typescript
 * const logger = AutoFlush(CreateSomeLogger());
 *
 * // Automatic cleanup with using keyword (TypeScript 5.2+)
 * await using _logger = logger;
 *
 * // Or manual cleanup
 * await logger.Dispose();
 * ```
 */
export function AutoFlush<T extends { Flush?: () => Promise<void> }>(
  target: T,
): T & { [Symbol.asyncDispose]?: () => Promise<void>; Dispose: () => Promise<void> } {
  async function Dispose(): Promise<void> {
    if (target.Flush) {
      await target.Flush();
    }
  }

  return Object.assign(target, {
    [Symbol.asyncDispose]: Dispose,
    Dispose,
  });
}
