import { z } from 'zod';
import { Registry, Sink, TypedLogger } from '../../../src/index.js';

export function CreateLoggerFixture() {
  const contextSchema = z.object({
    method: z.string().optional(),
    path: z.string().optional(),
    requestId: z.string().optional(),
    userAgent: z.string().optional(),
    ip: z.string().optional(),
    userId: z.string().optional(),
  });
  type Context = z.output<typeof contextSchema>;

  const registry = Registry.Create(
    contextSchema,
    (registry) =>
      [
        registry.DefineEvent('integration.request', z.object({ route: z.string() }), {
          kind: 'log',
          level: 'info',
        }),
      ] as const,
  );

  const memory = Sink.Memory<Context>();
  const loggerFactory = TypedLogger.For(registry, {
    sinks: [memory],
    captureErrorsAsEvent: {
      enabled: true,
      eventName: 't-log.internal.error',
      level: 'error',
    },
  });

  return {
    loggerFactory,
    memory,
  };
}
