/**
 * Cloudflare Workers integration
 * @module integrations/cloudflare-workers
 */

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { z } from 'zod';
import type { EventDefAny } from '../types.js';
import type { LoggerFactory } from '../omni-logger.js';
import type { LoggerInstance } from '../logger.js';
import type { IntegrationOptions } from './integration-options.js';
import { GetIntegrationDefaults } from './integration-options.js';

type WorkerInput<Env> = {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
};

function ResolveHeader(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  return value ?? undefined;
}

function BuildContext<Context, Env>(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  options: IntegrationOptions<Context, WorkerInput<Env>>,
): Partial<Context> {
  const defaults = GetIntegrationDefaults(options);
  const url = new URL(request.url);
  const baseContext = {
    method: request.method,
    path: url.pathname,
    requestId: ResolveHeader(request.headers, defaults.RequestIdHeader),
    userAgent: ResolveHeader(request.headers, 'user-agent'),
    ip:
      ResolveHeader(request.headers, 'cf-connecting-ip') ??
      ResolveHeader(request.headers, 'x-forwarded-for'),
  };
  const extraContext =
    options.GetContext?.({
      request,
      env,
      ctx,
    }) ?? {};
  return { ...baseContext, ...extraContext } as unknown as Partial<Context>;
}

export function CreateWorkerHandler<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
  Env,
  Result,
>(
  loggerFactory: LoggerFactory<ContextSchema, Events>,
  handler: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    logger: LoggerInstance<ContextSchema, Events>,
  ) => Result | Promise<Result>,
  options: IntegrationOptions<z.output<ContextSchema>, WorkerInput<Env>> = {},
): (request: Request, env: Env, ctx: ExecutionContext) => Result | Promise<Result> {
  return (request, env, ctx) => {
    const mergedContext = BuildContext(request, env, ctx, options) as z.output<ContextSchema>;
    return loggerFactory.Scoped(mergedContext, async (logger) => {
      try {
        return await handler(request, env, ctx, logger);
      } catch (error) {
        logger.CaptureError(error, {
          source: 'integration.worker',
          details: {
            method: request.method,
            path: new URL(request.url).pathname,
            requestId: mergedContext.requestId as string | undefined,
          },
        });
        throw error;
      }
    });
  };
}
