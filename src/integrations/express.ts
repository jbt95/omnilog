/**
 * Express integration
 * @module integrations/express
 */

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import type { EventDefAny } from '../types.js';
import type { LoggerFactory } from '../typed-logger.js';
import type { IntegrationOptions } from './integration-options.js';
import { GetIntegrationDefaults } from './integration-options.js';

function ResolveHeader(request: Request, name: string): string | undefined {
  const direct = request.get?.(name) ?? request.header?.(name);
  if (direct) return direct;
  const headers = request.headers ?? {};
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function BuildContext<Context>(
  request: Request,
  options: IntegrationOptions<Context, Request>,
): Partial<Context> {
  const defaults = GetIntegrationDefaults(options);
  const baseContext = {
    method: request.method,
    path: request.originalUrl ?? request.path,
    requestId: ResolveHeader(request, defaults.RequestIdHeader),
    userAgent: ResolveHeader(request, 'user-agent'),
    ip: request.ip ?? ResolveHeader(request, 'x-forwarded-for'),
  };
  const extraContext = options.GetContext?.(request) ?? {};
  return { ...baseContext, ...extraContext } as unknown as Partial<Context>;
}

export function CreateExpressMiddleware<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
>(
  loggerFactory: LoggerFactory<ContextSchema, Events>,
  options: IntegrationOptions<z.output<ContextSchema>, Request> = {},
): (req: Request, res: Response, next: NextFunction) => unknown {
  const defaults = GetIntegrationDefaults(options);
  const loggerKey = defaults.LoggerKey;

  return (req, _res, next) => {
    const context = BuildContext(req, options) as z.output<ContextSchema>;
    return loggerFactory.Scoped(context, (logger) => {
      (req as unknown as Record<string, unknown>)[loggerKey] = logger;
      try {
        const result = next();
        return Promise.resolve(result).catch((error) => {
          logger.CaptureError(error, {
            source: 'integration.express',
            details: {
              method: req.method,
              path: req.originalUrl ?? req.path,
            },
          });
          throw error;
        });
      } catch (error) {
        logger.CaptureError(error, {
          source: 'integration.express',
          details: {
            method: req.method,
            path: req.originalUrl ?? req.path,
          },
        });
        throw error;
      }
    });
  };
}
