/**
 * Hono integration
 * @module integrations/hono
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { z } from 'zod';
import type { EventDefAny } from '../types.js';
import type { LoggerFactory } from '../typed-logger.js';
import type { IntegrationOptions } from './integration-options.js';
import { GetIntegrationDefaults } from './integration-options.js';

type HonoContext = Context;
type HonoNext = Next;

function ResolveHeader(context: HonoContext, name: string): string | undefined {
  return context.req.header?.(name);
}

function ResolvePath(context: HonoContext): string | undefined {
  const path = context.req.path;
  if (path) return path;
  const url = context.req.url;
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function BuildContext<Context>(
  honoContext: HonoContext,
  options: IntegrationOptions<Context, HonoContext>,
): Partial<Context> {
  const defaults = GetIntegrationDefaults(options);
  const baseContext = {
    method: honoContext.req.method,
    path: ResolvePath(honoContext),
    requestId: ResolveHeader(honoContext, defaults.RequestIdHeader),
    userAgent: ResolveHeader(honoContext, 'user-agent'),
    ip: ResolveHeader(honoContext, 'x-forwarded-for'),
  };
  const extraContext = options.GetContext?.(honoContext) ?? {};
  return { ...baseContext, ...extraContext } as unknown as Partial<Context>;
}

export function CreateHonoMiddleware<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
>(
  loggerFactory: LoggerFactory<ContextSchema, Events>,
  options: IntegrationOptions<z.output<ContextSchema>, HonoContext> = {},
): MiddlewareHandler {
  const defaults = GetIntegrationDefaults(options);
  const loggerKey = defaults.LoggerKey;

  return async (context, next) => {
    const mergedContext = BuildContext(context, options) as z.output<ContextSchema>;
    await loggerFactory.Scoped(mergedContext, async (logger) => {
      context.set(loggerKey, logger);
      let captured = false;
      const CaptureError = (error: unknown) => {
        if (captured) return;
        captured = true;
        logger.CaptureError(error, {
          source: 'integration.hono',
          details: {
            method: context.req.method,
            path: ResolvePath(context),
          },
        });
      };

      try {
        await (next as HonoNext)();
      } catch (error) {
        CaptureError(error);
        throw error;
      }

      const contextError = (context as unknown as { error?: unknown }).error;
      if (contextError !== undefined) {
        CaptureError(contextError);
      }
    });
  };
}
