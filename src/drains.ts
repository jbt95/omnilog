/**
 * External observability platform drains
 * @module drains
 */

import { createHash } from 'node:crypto';
import type { Envelope, Sink } from './types.js';

/**
 * Configuration for drains
 */
export type DrainConfig = {
  /** API endpoint URL */
  endpoint?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Dataset/collection name */
  dataset?: string;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Batch size for batching (default: 100) */
  batchSize?: number;
  /** Flush interval in ms (default: 5000) */
  flushInterval?: number;
};

/**
 * Drain function type for external platforms
 */
export type Drain = <Context, Payload>(
  events: Envelope<Context, Payload>[],
) => Promise<void> | void;

/**
 * Create an Axiom drain
 * 
 * Sends events to Axiom.co for storage and analysis.
 * Configure via environment variables or options:
 * - `AXIOM_ENDPOINT` or `endpoint` option
 * - `AXIOM_TOKEN` or `apiKey` option
 * - `AXIOM_DATASET` or `dataset` option
 * 
 * @param config - Drain configuration
 * @returns Axiom drain function
 * 
 * @example
 * ```typescript
 * const drain = CreateAxiomDrain({
 *   endpoint: 'https://api.axiom.co',
 *   apiKey: process.env.AXIOM_TOKEN,
 *   dataset: 'my-app',
 * });
 * 
 * const loggerFactory = TypedLogger.For(registry, {
 *   sinks: [drain],
 * });
 * const logger = loggerFactory.Singleton();
 * ```
 */
export function CreateAxiomDrain(config: DrainConfig): Drain {
  const endpoint = config.endpoint ?? process.env.AXIOM_ENDPOINT;
  const apiKey = config.apiKey ?? process.env.AXIOM_TOKEN;
  const dataset = config.dataset ?? process.env.AXIOM_DATASET;

  return async (events) => {
    if (!endpoint || !apiKey || !dataset) {
      console.warn('Axiom drain: missing configuration');
      return;
    }

    try {
      const response = await fetch(`${endpoint}/v1/datasets/${dataset}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...config.headers,
        },
        body: JSON.stringify(events),
      });

      if (!response.ok) {
        console.error(`Axiom drain failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Axiom drain error:', error);
    }
  };
}

/**
 * Create an OTLP drain for OpenTelemetry
 * 
 * Sends events in OTLP format to any OpenTelemetry-compatible backend
 * (Grafana, Datadog, Honeycomb, etc.).
 * 
 * @param config - Drain configuration
 * @returns OTLP drain function
 * 
 * @example
 * ```typescript
 * const drain = CreateOTLPDrain({
 *   endpoint: 'http://localhost:4318',
 * });
 * 
 * const loggerFactory = TypedLogger.For(registry, {
 *   sinks: [drain],
 * });
 * const logger = loggerFactory.Singleton();
 * ```
 */
export function CreateOTLPDrain(config: DrainConfig): Drain {
  const endpoint = config.endpoint ?? process.env.OTLP_ENDPOINT ?? 'http://localhost:4318';

  return async (events) => {
    try {
      const response = await fetch(`${endpoint}/v1/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          resourceLogs: events.map((event) => ({
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'typedlog' } },
              ],
            },
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: BigInt(new Date(event.ts).getTime()) * 1000000n,
                    severityText: event.level?.toUpperCase() ?? 'INFO',
                    body: { stringValue: JSON.stringify(event) },
                    attributes: Object.entries(event.context as Record<string, unknown>).map(([key, value]) => ({
                      key,
                      value: { stringValue: JSON.stringify(value) },
                    })),
                  },
                ],
              },
            ],
          })),
        }),
      });

      if (!response.ok) {
        console.error(`OTLP drain failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('OTLP drain error:', error);
    }
  };
}

/**
 * Create a webhook drain
 * 
 * Sends events to a custom webhook URL.
 * 
 * @param config - Drain configuration with URL
 * @returns Webhook drain function
 * 
 * @example
 * ```typescript
 * const drain = CreateWebhookDrain({
 *   url: 'https://my-service.com/webhook',
 *   headers: { 'X-Custom-Header': 'value' },
 * });
 * 
 * const loggerFactory = TypedLogger.For(registry, {
 *   sinks: [drain],
 * });
 * const logger = loggerFactory.Singleton();
 * ```
 */
export function CreateWebhookDrain(config: DrainConfig & { url: string }): Drain {
  return async (events) => {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify(events),
      });

      if (!response.ok) {
        console.error(`Webhook drain failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Webhook drain error:', error);
    }
  };
}

/**
 * Batched drain wrapper for efficient sending
 * 
 * Buffers events and flushes them in batches or after a timeout.
 * 
 * @example
 * ```typescript
 * const axiomDrain = CreateAxiomDrain(config);
 * const batched = new BatchedDrain(axiomDrain, {
 *   batchSize: 100,
 *   flushInterval: 5000,
 * });
 * 
 * const loggerFactory = TypedLogger.For(registry, {
 *   sinks: [batched.CreateSink()],
 * });
 * const logger = loggerFactory.Singleton();
 * ```
 */
export class BatchedDrain<Context, Payload> {
  private events: Envelope<Context, Payload>[] = [];
  private drain: Drain;
  private batchSize: number;
  private flushInterval: number;
  private timeoutId?: ReturnType<typeof setTimeout> | undefined;

  constructor(
    drain: Drain,
    options: { batchSize?: number; flushInterval?: number } = {},
  ) {
    this.drain = drain;
    this.batchSize = options.batchSize ?? 100;
    this.flushInterval = options.flushInterval ?? 5000;
  }

  /**
   * Add an event to the batch
   */
  Add(event: Envelope<Context, Payload>): void {
    this.events.push(event);

    if (this.events.length >= this.batchSize) {
      this.Flush();
    } else if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => this.Flush(), this.flushInterval);
    }
  }

  /**
   * Flush all buffered events
   */
  async Flush(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    if (this.events.length === 0) return;

    const batch = this.events.splice(0, this.batchSize);
    await this.drain(batch);
  }

  /**
   * Create a sink that adds to this batch
   */
  CreateSink(): Sink<Envelope<Context, Payload>> {
    return (event: Envelope<Context, Payload>) => this.Add(event);
  }
}

/**
 * Create a unique fingerprint for an event
 * 
 * @param event - Event to fingerprint
 * @returns 16-character hexadecimal fingerprint
 */
export function CreateFingerprint(event: Envelope<unknown, unknown>): string {
  const content = `${event.name}:${event.ts}:${JSON.stringify(event.payload)}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
