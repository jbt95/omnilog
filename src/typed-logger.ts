/**
 * Typed logger factory for singleton and request-scoped usage
 * @module typed-logger
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type {
  EventDefAny,
  Registry,
  RegistryBuilder,
} from './types.js';
import type { LoggerInstance, LoggerOptions } from './logger.js';
import { CreateLogger } from './logger.js';
import { CreateRegistry } from './registry.js';

export type LoggerFactory<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
> = {
  Singleton: () => LoggerInstance<ContextSchema, Events>;
  Scoped: <Result>(
    context: z.output<ContextSchema>,
    fn: (logger: LoggerInstance<ContextSchema, Events>) => Result | Promise<Result>,
  ) => Result | Promise<Result>;
  Get: () => LoggerInstance<ContextSchema, Events>;
};

export type LoggerCreateOptions<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  Events extends readonly EventDefAny[],
> = {
  contextSchema: ContextSchema;
  events: Events | ((registry: RegistryBuilder<ContextSchema>) => Events);
} & LoggerOptions<z.output<ContextSchema>>;

export class TypedLogger {
  /**
   * Create a logger factory from a context schema and events definition.
   *
   * @example
   * ```typescript
   * const loggerFactory = TypedLogger.Create({
   *   contextSchema,
   *   events: (registry) => [
   *     registry.DefineEvent('user.login', z.object({ id: z.string() }), {
   *       kind: 'log',
   *       require: ['traceId'] as const,
   *     }),
   *   ] as const,
   *   sinks: [Sink.Environment()],
   * });
   *
   * await loggerFactory.Scoped({ traceId: 'abc' }, (logger) => {
   *   logger.Emit('user.login', { id: 'user_1' });
   * });
   * ```
   */
  static Create<
    ContextSchema extends z.ZodObject<z.ZodRawShape>,
    const Events extends readonly EventDefAny[],
  >(
    options: {
      contextSchema: ContextSchema;
      events: Events;
    } & LoggerOptions<z.output<ContextSchema>>,
  ): LoggerFactory<ContextSchema, Events>;
  static Create<
    ContextSchema extends z.ZodObject<z.ZodRawShape>,
    const Events extends readonly EventDefAny[],
  >(
    options: {
      contextSchema: ContextSchema;
      events: (registry: RegistryBuilder<ContextSchema>) => Events;
    } & LoggerOptions<z.output<ContextSchema>>,
  ): LoggerFactory<ContextSchema, Events>;
  static Create<
    ContextSchema extends z.ZodObject<z.ZodRawShape>,
    const Events extends readonly EventDefAny[],
  >(
    options: LoggerCreateOptions<ContextSchema, Events>,
  ): LoggerFactory<ContextSchema, Events> {
    const { contextSchema, events, ...loggerOptions } = options;
    const registry = CreateRegistry(contextSchema, events as any);
    return TypedLogger.For(registry as Registry<ContextSchema, Events>, loggerOptions);
  }

  /**
   * Create a logger factory from an existing registry.
   */
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
      fn: (logger: LoggerInstance<ContextSchema, Events>) => Result | Promise<Result>,
    ): Result | Promise<Result> {
      const logger = CreateLogger(registry, options);
      return loggerStore.run(logger, () => logger.Run(context, () => fn(logger)));
    }

    return {
      Singleton,
      Scoped,
      Get,
    };
  }
}
