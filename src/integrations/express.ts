/**
 * Express integration
 * @module integrations/express
 */

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import type { EventDefAny } from '../types.js';
import type { LoggerFactory } from '../omni-logger.js';
import type { IntegrationOptions } from './integration-options.js';
import { GetIntegrationDefaults } from './integration-options.js';

const OmniLogExpressErrorCaptured = Symbol.for('omnilog.express.error.captured');
const OmniLogExpressRequestCaptured = Symbol.for('omnilog.express.request.captured');

type CaptureLogger = {
  CaptureError: (
    error: unknown,
    options?: { source?: string; details?: Record<string, unknown> },
  ) => void;
};

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

function CaptureExpressError(request: Request, loggerKey: string, error: unknown): void {
  const candidate = (request as unknown as Record<string, unknown>)[loggerKey];
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    typeof (candidate as { CaptureError?: unknown }).CaptureError !== 'function'
  ) {
    return;
  }

  if (error && typeof error === 'object') {
    const marker = error as Record<string | symbol, unknown>;
    if (marker[OmniLogExpressErrorCaptured]) return;
    marker[OmniLogExpressErrorCaptured] = true;
  }

  (request as unknown as Record<string | symbol, unknown>)[OmniLogExpressRequestCaptured] = true;

  (candidate as CaptureLogger).CaptureError(error, {
    source: 'integration.express',
    details: {
      method: request.method,
      path: request.originalUrl ?? request.path,
      requestId: ResolveHeader(request, 'x-request-id'),
    },
  });
}

function ResolveErrorMessageFromResponse(body: unknown, statusCode: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      return record.message;
    }
    if (typeof record.error === 'string' && record.error.trim().length > 0) {
      return record.error;
    }
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
        return parsed.message;
      }
      if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
        return parsed.error;
      }
    } catch {
      // Ignore parse errors and use raw string body below.
    }
    return body;
  }

  return `HTTP ${statusCode}`;
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
  const installedApps = new WeakSet<object>();

  function EnsureErrorMiddleware(request: Request): void {
    const app = request.app as unknown as
      | {
          use: (
            handler: (error: unknown, req: Request, res: Response, next: NextFunction) => void,
          ) => void;
        }
      | undefined;
    if (!app) return;
    if (installedApps.has(app as object)) return;

    app.use((error, req, _res, next) => {
      CaptureExpressError(req, loggerKey, error);
      next(error);
    });
    installedApps.add(app as object);
  }

  return (req, _res, next) => {
    EnsureErrorMiddleware(req);
    const context = BuildContext(req, options) as z.output<ContextSchema>;
    return loggerFactory.Scoped(context, (logger) => {
      (req as unknown as Record<string, unknown>)[loggerKey] = logger;
      let responseBody: unknown;
      const response = _res as unknown as Record<string, unknown>;
      const hasJson = typeof _res.json === 'function';
      const hasSend = typeof _res.send === 'function';
      const originalJson = hasJson ? _res.json.bind(_res) : undefined;
      const originalSend = hasSend ? _res.send.bind(_res) : undefined;

      if (originalJson) {
        response.json = ((body: unknown) => {
          responseBody = body;
          return originalJson(body);
        }) as Response['json'];
      }

      if (originalSend) {
        response.send = ((body: unknown) => {
          responseBody = body;
          return originalSend(body);
        }) as Response['send'];
      }

      if (typeof _res.once === 'function') {
        _res.once('finish', () => {
          const statusCode = _res.statusCode ?? 0;
          if (statusCode < 500) return;
          const captured = (req as unknown as Record<string | symbol, unknown>)[
            OmniLogExpressRequestCaptured
          ];
          if (captured) return;
          const message = ResolveErrorMessageFromResponse(responseBody, statusCode);
          CaptureExpressError(req, loggerKey, new Error(message));
        });
      }

      try {
        return next();
      } catch (error) {
        CaptureExpressError(req, loggerKey, error);
        throw error;
      }
    });
  };
}
