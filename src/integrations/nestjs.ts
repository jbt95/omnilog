/**
 * NestJS integration
 * @module integrations/nestjs
 */

import { APP_INTERCEPTOR } from '@nestjs/core';
import type {
  CallHandler,
  DynamicModule,
  ExecutionContext,
  NestInterceptor,
  Provider,
} from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import type { EventDefAny } from '../types.js';
import type { LoggerFactory } from '../typed-logger.js';
import type { LoggerInstance } from '../logger.js';
import type { IntegrationOptions } from './integration-options.js';
import { GetIntegrationDefaults } from './integration-options.js';

const TypedLogOptionsToken = 'TYPEDLOG_OPTIONS';
const TypedLogLoggerFactoryToken = 'TYPEDLOG_LOGGER_FACTORY';

export type TypedLogModuleOptions<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
> = IntegrationOptions<z.output<ContextSchema>, Request> & {
  loggerFactory: LoggerFactory<ContextSchema, Events>;
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

class TypedLogInterceptor<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
> implements NestInterceptor {
  private loggerFactory: LoggerFactory<ContextSchema, Events>;
  private options: IntegrationOptions<z.output<ContextSchema>, Request>;

  constructor(
    loggerFactory: LoggerFactory<ContextSchema, Events>,
    options: IntegrationOptions<z.output<ContextSchema>, Request>,
  ) {
    this.loggerFactory = loggerFactory;
    this.options = options;
  }

  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const request = context.switchToHttp().getRequest<Request>();
    const defaults = GetIntegrationDefaults(this.options);
    const loggerKey = defaults.LoggerKey;
    const mergedContext = BuildContext(request, this.options) as z.output<ContextSchema>;

    return this.loggerFactory.Scoped(mergedContext, (logger) => {
      (request as unknown as Record<string, unknown>)[loggerKey] = logger as LoggerInstance<
        ContextSchema,
        Events
      >;
      return next.handle();
    }) as ReturnType<CallHandler['handle']>;
  }
}

export class TypedLogModule {
  static forRoot<
    ContextSchema extends z.ZodObject<z.ZodRawShape>,
    const Events extends readonly EventDefAny[],
  >(options: TypedLogModuleOptions<ContextSchema, Events>): DynamicModule {
    const interceptor = new TypedLogInterceptor(options.loggerFactory, options);
    const providers: Provider[] = [
      { provide: TypedLogOptionsToken, useValue: options },
      { provide: TypedLogLoggerFactoryToken, useValue: options.loggerFactory },
      { provide: APP_INTERCEPTOR, useValue: interceptor },
    ];

    return {
      module: TypedLogModule,
      providers,
      exports: [TypedLogLoggerFactoryToken],
    };
  }
}
