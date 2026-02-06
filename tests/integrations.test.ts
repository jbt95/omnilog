import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import type { Context as HonoContext, Next as HonoNext } from 'hono';
import type { APIGatewayProxyEventV2, Context as LambdaContext } from 'aws-lambda';
import type { ExecutionContext, Provider, ValueProvider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { ExecutionContext as WorkerExecutionContext } from '@cloudflare/workers-types';
import { Handler, Middleware, Registry, Sink, TypedLogModule, TypedLogger } from '../src/index.js';

function CreateTestLoggerFactory() {
  const contextSchema = z.object({
    method: z.string().optional(),
    path: z.string().optional(),
    requestId: z.string().optional(),
    userAgent: z.string().optional(),
    ip: z.string().optional(),
    userId: z.string().optional(),
  });
  type Context = z.output<typeof contextSchema>;
  const memory = Sink.Memory<Context>();
  const registry = Registry.Create(
    contextSchema,
    (registry) =>
      [
        registry.DefineEvent('integration.event', z.object({ ok: z.boolean() }), {
          kind: 'log',
        }),
      ] as const,
  );
  const loggerFactory = TypedLogger.For(registry, {
    sinks: [memory],
  });

  return { loggerFactory, memory };
}

describe('Integrations', function IntegrationsSuite() {
  it('express middleware scopes and attaches logger', async function ExpressMiddlewareScopesAndAttachesLogger() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const middleware = Middleware.Express(loggerFactory);

    const req = {
      method: 'GET',
      originalUrl: '/express',
      ip: '127.0.0.1',
      header: (name: string) => {
        if (name === 'x-request-id') return 'req-express';
        if (name === 'user-agent') return 'ua-express';
        return undefined;
      },
    } as unknown as Request;

    let nextCalled = false;
    await middleware(
      req,
      {} as Response,
      (() => {
        nextCalled = true;
        const logger = (req as unknown as Record<string, unknown>).logger as {
          Emit: (name: string, payload: { ok: boolean }) => void;
        };
        logger.Emit('integration.event', { ok: true });
      }) as NextFunction,
    );

    expect(nextCalled).toBe(true);
    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.path).toBe('/express');
    expect(memory.events[0]?.context.requestId).toBe('req-express');
  });

  it('hono middleware scopes and attaches logger', async function HonoMiddlewareScopesAndAttachesLogger() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const middleware = Middleware.Hono(loggerFactory);
    const store = new Map<string, unknown>();
    const context = {
      req: {
        method: 'POST',
        url: 'https://example.com/hono',
        header: (name: string) => (name === 'x-request-id' ? 'req-hono' : undefined),
      },
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
    } as unknown as HonoContext;

    await middleware(context, (() => {
      const logger = store.get('logger') as {
        Emit: (name: string, payload: { ok: boolean }) => void;
      };
      logger.Emit('integration.event', { ok: true });
    }) as HonoNext);

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.path).toBe('/hono');
    expect(memory.events[0]?.context.requestId).toBe('req-hono');
  });

  it('lambda handler passes logger and context', async function LambdaHandlerPassesLoggerAndContext() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const handler = Handler.Lambda(loggerFactory, async (_event, _context, logger) => {
      logger.Emit('integration.event', { ok: true });
      return { statusCode: 200, body: 'ok' };
    });

    const event = {
      rawPath: '/lambda',
      headers: { 'x-request-id': 'req-lambda', 'user-agent': 'ua-lambda' },
      requestContext: {
        requestId: 'aws-req',
        http: { method: 'GET', path: '/lambda', sourceIp: '1.2.3.4', userAgent: 'ua-lambda' },
      },
    } as unknown as APIGatewayProxyEventV2;
    const response = await handler(event, { awsRequestId: 'aws-context' } as LambdaContext);

    expect(response.statusCode).toBe(200);
    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.method).toBe('GET');
    expect(memory.events[0]?.context.path).toBe('/lambda');
    expect(memory.events[0]?.context.requestId).toBe('aws-req');
  });

  it('worker handler passes logger and context', async function WorkerHandlerPassesLoggerAndContext() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const handler = Handler.Worker(loggerFactory, async (_request, _env, _ctx, logger) => {
      logger.Emit('integration.event', { ok: true });
      return new Response('ok');
    });

    const request = new Request('https://example.com/worker', {
      headers: {
        'x-request-id': 'req-worker',
        'user-agent': 'ua-worker',
        'cf-connecting-ip': '9.9.9.9',
      },
    });
    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as WorkerExecutionContext;
    const response = await handler(request, {}, ctx);

    expect(response.status).toBe(200);
    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.path).toBe('/worker');
    expect(memory.events[0]?.context.requestId).toBe('req-worker');
  });

  it('nestjs module interceptor scopes and attaches logger', async function NestModuleInterceptorScopesAndAttachesLogger() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const moduleDefinition = TypedLogModule.forRoot({ loggerFactory });
    const providers = (moduleDefinition.providers ?? []) as Provider[];
    const interceptorProvider = providers.find((provider): provider is ValueProvider => {
      return (
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === APP_INTERCEPTOR
      );
    });
    const interceptor = interceptorProvider?.useValue as {
      intercept: (context: ExecutionContext, next: { handle: () => unknown }) => unknown;
    };

    const request = {
      method: 'GET',
      originalUrl: '/nest',
      header: (name: string) => (name === 'x-request-id' ? 'req-nest' : undefined),
    } as unknown as Request;

    const result = await interceptor.intercept(
      { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext,
      {
        handle: () => {
          const logger = (request as unknown as Record<string, unknown>).logger as {
            Emit: (name: string, payload: { ok: boolean }) => void;
          };
          logger.Emit('integration.event', { ok: true });
          return 'ok';
        },
      },
    );

    expect(result).toBe('ok');
    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.context.path).toBe('/nest');
    expect(memory.events[0]?.context.requestId).toBe('req-nest');
  });

  it('express middleware captures thrown user errors as internal events', async function ExpressMiddlewareCapturesThrownUserErrorsAsInternalEvents() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const middleware = Middleware.Express(loggerFactory);
    const req = {
      method: 'GET',
      originalUrl: '/express-error',
      header: () => undefined,
    } as unknown as Request;

    expect(() =>
      middleware(
        req,
        {} as Response,
        (() => {
          throw new Error('express boom');
        }) as NextFunction,
      ),
    ).toThrow('express boom');

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.name).toBe('typedlog.internal.error');
    const payload = memory.events[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.express');
    expect(payload?.message).toBe('express boom');
  });

  it('hono middleware captures thrown user errors as internal events', async function HonoMiddlewareCapturesThrownUserErrorsAsInternalEvents() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const middleware = Middleware.Hono(loggerFactory);
    const context = {
      req: {
        method: 'POST',
        url: 'https://example.com/hono-error',
        path: '/hono-error',
        header: () => undefined,
      },
      set: () => {},
    } as unknown as HonoContext;

    await expect(
      middleware(
        context,
        (async () => {
          throw new Error('hono boom');
        }) as HonoNext,
      ),
    ).rejects.toThrow('hono boom');

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.name).toBe('typedlog.internal.error');
    const payload = memory.events[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.hono');
    expect(payload?.message).toBe('hono boom');
  });

  it('lambda handler captures thrown user errors as internal events', async function LambdaHandlerCapturesThrownUserErrorsAsInternalEvents() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const handler = Handler.Lambda(loggerFactory, async () => {
      throw new Error('lambda boom');
    });

    const event = {
      rawPath: '/lambda-error',
      requestContext: {
        requestId: 'aws-error',
        http: { method: 'GET', path: '/lambda-error', sourceIp: '1.2.3.4', userAgent: 'ua' },
      },
    } as unknown as APIGatewayProxyEventV2;

    await expect(handler(event, { awsRequestId: 'ctx' } as LambdaContext)).rejects.toThrow(
      'lambda boom',
    );

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.name).toBe('typedlog.internal.error');
    const payload = memory.events[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.lambda');
    expect(payload?.message).toBe('lambda boom');
  });

  it('worker handler captures thrown user errors as internal events', async function WorkerHandlerCapturesThrownUserErrorsAsInternalEvents() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const handler = Handler.Worker(loggerFactory, async () => {
      throw new Error('worker boom');
    });
    const request = new Request('https://example.com/worker-error');
    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as WorkerExecutionContext;

    await expect(handler(request, {}, ctx)).rejects.toThrow('worker boom');

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.name).toBe('typedlog.internal.error');
    const payload = memory.events[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.worker');
    expect(payload?.message).toBe('worker boom');
  });

  it('nestjs interceptor captures thrown user errors as internal events', async function NestjsInterceptorCapturesThrownUserErrorsAsInternalEvents() {
    const { loggerFactory, memory } = CreateTestLoggerFactory();
    const moduleDefinition = TypedLogModule.forRoot({ loggerFactory });
    const providers = (moduleDefinition.providers ?? []) as Provider[];
    const interceptorProvider = providers.find((provider): provider is ValueProvider => {
      return (
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === APP_INTERCEPTOR
      );
    });
    const interceptor = interceptorProvider?.useValue as {
      intercept: (context: ExecutionContext, next: { handle: () => unknown }) => unknown;
    };

    const request = {
      method: 'GET',
      originalUrl: '/nest-error',
      header: () => undefined,
    } as unknown as Request;

    expect(() =>
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext,
        {
          handle: () => {
            throw new Error('nest boom');
          },
        },
      ),
    ).toThrow('nest boom');

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]?.name).toBe('typedlog.internal.error');
    const payload = memory.events[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.nestjs');
    expect(payload?.message).toBe('nest boom');
  });
});
