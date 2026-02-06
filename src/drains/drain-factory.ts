import type { Drain, DrainHandle } from '../types.js';
import { BatchedDrain, type DrainBatchOptions } from './batched-drain.js';

/**
 * Create a sink handle from a raw drain and batching options.
 */
export function CreateDrainSink<Context, Payload>(
  drain: Drain,
  options?: DrainBatchOptions,
): DrainHandle<Context, Payload> {
  const batched = new BatchedDrain<Context, Payload>(drain, options);
  return {
    Sink: batched.CreateSink(),
    Flush: () => batched.Flush(),
  };
}

/**
 * Create a provider sink factory from a provider drain constructor.
 */
export function CreateDrainSinkFactory<Config extends DrainBatchOptions>(
  createDrain: (config: Config) => Drain,
): <Context = unknown, Payload = unknown>(config: Config) => DrainHandle<Context, Payload> {
  return function CreateProviderSink<Context = unknown, Payload = unknown>(
    config: Config,
  ): DrainHandle<Context, Payload> {
    return CreateDrainSink<Context, Payload>(createDrain(config), config);
  };
}
