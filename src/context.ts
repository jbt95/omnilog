/**
 * Async context management for request-scoped logging
 * @module context
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { ContextManager } from './types.js';

/**
 * Create a context manager for async context propagation
 * 
 * @param schema - Zod schema for validating context
 * @returns Context manager with run, with, and get methods
 * 
 * @example
 * ```typescript
 * const contextSchema = z.object({ traceId: z.string(), userId: z.string() });
 * const context = CreateContext(contextSchema);
 * 
 * await context.Run({ traceId: 'abc', userId: '123' }, async () => {
 *   // Context is available throughout the async call stack
 *   const current = context.Get(); // { traceId: 'abc', userId: '123' }
 * });
 * ```
 */
export function CreateContext<Schema extends z.ZodObject<z.ZodRawShape>>(
  schema: Schema,
): ContextManager<z.output<Schema>> {
  const storage = new AsyncLocalStorage<z.output<Schema>>();

  function Parse(input: unknown): z.output<Schema> {
    const result = schema.safeParse(input);

    if (!result.success) {
      throw new Error(`Invalid context: ${result.error.message}`);
    }

    return result.data;
  }

  return {
    schema,
    Run: <Result>(context: z.output<Schema>, fn: () => Result) =>
      storage.run(Parse(context), fn),
    With: <Result>(context: Partial<z.output<Schema>>, fn: () => Result) => {
      const current = storage.getStore() ?? ({} as z.output<Schema>);
      const merged = { ...current, ...context } as z.output<Schema>;
      return storage.run(Parse(merged), fn);
    },
    Get: () => storage.getStore(),
  };
}
