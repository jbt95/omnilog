/**
 * Typed logger factory for singleton and request-scoped usage
 * @module typed-logger
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { EventDefAny, Registry } from './types.js';
import type { LoggerInstance, LoggerOptions } from './logger.js';
import { CreateLogger } from './logger.js';

export type LoggerFactory<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
> = {
  Singleton: () => LoggerInstance<ContextSchema, Events>;
  Scoped: <Result>(
    context: z.output<ContextSchema>,
    fn: () => Result | Promise<Result>,
  ) => Result | Promise<Result>;
  Get: () => LoggerInstance<ContextSchema, Events>;
};

export class TypedLogger {
  static For<
    ContextSchema extends z.ZodObject<z.ZodRawShape>,
    const Events extends readonly EventDefAny[],
  >(
    registry: Registry<ContextSchema, Events>,
    options: LoggerOptions<z.output<ContextSchema>> = {},
  ): LoggerFactory<ContextSchema, Events> {
    const loggerStore = new AsyncLocalStorage<LoggerInstance<ContextSchema, Events>>();
    let singleton: LoggerInstance<ContextSchema, Events> | undefined;

    function Singleton(): LoggerInstance<ContextSchema, Events> {
      if (!singleton) {
        singleton = CreateLogger(registry, options);
      }
      return singleton;
    }

    function Get(): LoggerInstance<ContextSchema, Events> {
      const logger = loggerStore.getStore();
      if (!logger) {
        throw new Error('No logger available in the current scope');
      }
      return logger;
    }

    function Scoped<Result>(
      context: z.output<ContextSchema>,
      fn: () => Result | Promise<Result>,
    ): Result | Promise<Result> {
      const logger = CreateLogger(registry, options);
      return loggerStore.run(logger, () => logger.Run(context, fn));
    }

    return {
      Singleton,
      Scoped,
      Get,
    };
  }
}
