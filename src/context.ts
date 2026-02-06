/**
 * Async context management for request-scoped logging
 * @module context
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { ContextEnricher, ContextManager } from './types.js';

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
    Run: <Result>(context: z.output<Schema>, fn: () => Result) => storage.run(Parse(context), fn),
    With: <Result>(context: Partial<z.output<Schema>>, fn: () => Result) => {
      const current = storage.getStore() ?? ({} as z.output<Schema>);
      const merged = { ...current, ...context } as z.output<Schema>;
      return storage.run(Parse(merged), fn);
    },
    Get: () => storage.getStore(),
  };
}

/**
 * Create a runtime metadata enricher.
 */
export function CreateRuntimeEnricher<
  Context extends Record<string, unknown> = Record<string, unknown>,
>(options: { key?: string } = {}): ContextEnricher<Context> {
  const targetKey = options.key ?? 'runtime';

  return () =>
    ({
      [targetKey]: {
        name: 'node',
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
      },
    }) as Partial<Context>;
}

/**
 * Create a region enricher from environment variables.
 */
export function CreateRegionEnricher<
  Context extends Record<string, unknown> = Record<string, unknown>,
>(
  options: {
    key?: string;
    envVarNames?: readonly string[];
  } = {},
): ContextEnricher<Context> {
  const targetKey = options.key ?? 'region';
  const envVarNames = options.envVarNames ?? ['REGION', 'AWS_REGION', 'CLOUDFLARE_REGION'];

  return () => {
    const region = envVarNames
      .map((name) => process.env[name])
      .find((value): value is string => Boolean(value));
    if (!region) return {};
    return { [targetKey]: region } as Partial<Context>;
  };
}

/**
 * Create an enricher that copies selected headers from context.
 *
 * Expects `context[sourceKey]` to contain a header map.
 */
export function CreateRequestHeadersEnricher<
  Context extends Record<string, unknown> = Record<string, unknown>,
>(
  headerNames: readonly string[],
  options: {
    sourceKey?: string;
    targetKey?: string;
  } = {},
): ContextEnricher<Context> {
  const sourceKey = options.sourceKey ?? 'headers';
  const targetKey = options.targetKey ?? 'requestHeaders';
  const normalizedHeaderNames = headerNames.map((headerName) => headerName.toLowerCase());

  return ({ context }) => {
    const headerMap = context[sourceKey];
    if (!headerMap || typeof headerMap !== 'object') return {};

    const selectedHeaders: Record<string, string> = {};
    const sourceHeaders = headerMap as Record<string, unknown>;
    for (const [headerName, value] of Object.entries(sourceHeaders)) {
      if (!normalizedHeaderNames.includes(headerName.toLowerCase())) continue;
      if (typeof value !== 'string') continue;
      selectedHeaders[headerName] = value;
    }

    if (Object.keys(selectedHeaders).length === 0) return {};
    return { [targetKey]: selectedHeaders } as Partial<Context>;
  };
}
