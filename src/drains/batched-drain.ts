import type {
  Drain,
  DrainConfig,
  DrainFailure,
  DrainQueueStrategy,
  DrainRetryConfig,
  DrainTelemetryConfig,
  DrainTelemetryEvent,
  Envelope,
  Sink,
} from '../types.js';
import { CreateDomainError } from '../error.js';

export type DrainBatchOptions = Pick<
  DrainConfig,
  'batchSize' | 'flushInterval' | 'retry' | 'queue' | 'telemetry' | 'deadLetterSink'
>;

/**
 * Batched drain wrapper for efficient sending.
 *
 * Buffers events and flushes them in batches or after a timeout.
 */
export class BatchedDrain<Context, Payload> {
  private events: Envelope<Context, Payload>[] = [];
  private readonly drain: Drain;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly maxQueueSize: number;
  private readonly queueStrategy: DrainQueueStrategy;
  private readonly queueSampleRate: number;
  private readonly retryConfig: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitter: NonNullable<DrainRetryConfig['jitter']>;
    perAttemptTimeoutMs?: number;
  };
  private readonly telemetry: DrainTelemetryConfig | undefined;
  private readonly deadLetterSink: Sink<DrainFailure<Context, Payload>> | undefined;
  private timeoutId?: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;
  private pendingFlush = false;
  private waitingForSpaceResolvers: Array<() => void> = [];

  constructor(drain: Drain, options: DrainBatchOptions = {}) {
    this.drain = drain;
    this.batchSize = Math.max(1, options.batchSize ?? 100);
    this.flushInterval = Math.max(0, options.flushInterval ?? 5000);
    this.maxQueueSize =
      options.queue?.maxItems === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(1, options.queue.maxItems);
    this.queueStrategy = options.queue?.strategy ?? 'drop-newest';
    this.queueSampleRate = Math.min(Math.max(options.queue?.sampleRate ?? 0.5, 0), 1);

    const retry = options.retry ?? {};
    this.retryConfig = {
      maxAttempts: Math.max(1, retry.maxAttempts ?? 3),
      baseDelayMs: Math.max(0, retry.baseDelayMs ?? 100),
      maxDelayMs: Math.max(0, retry.maxDelayMs ?? 3000),
      jitter: retry.jitter ?? 'none',
      ...(retry.perAttemptTimeoutMs !== undefined
        ? { perAttemptTimeoutMs: Math.max(1, retry.perAttemptTimeoutMs) }
        : {}),
    };

    this.telemetry = options.telemetry;
    this.deadLetterSink = options.deadLetterSink as
      | Sink<DrainFailure<Context, Payload>>
      | undefined;
  }

  /**
   * Add an event to the batch.
   */
  Add(event: Envelope<Context, Payload>): void | Promise<void> {
    const backpressureResult = this.ApplyBackpressure();
    if (backpressureResult instanceof Promise) {
      return backpressureResult.then((shouldEnqueue) => {
        if (shouldEnqueue) {
          this.Enqueue(event);
        }
      });
    }

    if (!backpressureResult) return;
    this.Enqueue(event);
  }

  /**
   * Flush all buffered events.
   */
  async Flush(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    if (this.flushing) {
      this.pendingFlush = true;
      return;
    }

    if (this.events.length === 0) return;

    this.flushing = true;
    try {
      while (this.events.length > 0) {
        const batch = this.events.splice(0, this.batchSize);
        this.NotifyQueueSpace();
        const flushStartedAt = Date.now();

        try {
          await this.SendWithRetry(batch);
          this.EmitTelemetry('sent', batch.length, { batchSize: String(batch.length) });
          this.EmitTelemetry('flushDurationMs', Date.now() - flushStartedAt);
        } catch (error) {
          this.EmitTelemetry('failed', batch.length, { batchSize: String(batch.length) });
          await this.PublishDeadLetter(batch, error);
          console.error('Drain flush failed:', error);
        }
      }
    } finally {
      this.flushing = false;

      if (this.pendingFlush) {
        this.pendingFlush = false;
        if (this.events.length > 0) {
          return this.Flush();
        }
      }
    }
  }

  /**
   * Create a sink that adds to this batch.
   */
  CreateSink(): Sink<Envelope<Context, Payload>> {
    return (event: Envelope<Context, Payload>) => this.Add(event);
  }

  private ScheduleFlush(): void {
    if (this.timeoutId || this.events.length === 0) return;
    this.timeoutId = setTimeout(() => {
      void this.Flush();
    }, this.flushInterval);
  }

  private EmitTelemetry(metric: string, value: number, tags?: Record<string, string>): void {
    if (!this.telemetry) return;

    const mergedTags = {
      ...(this.telemetry.tags ?? {}),
      ...(tags ?? {}),
    };

    const telemetryEvent: DrainTelemetryEvent = {
      metric: `${this.telemetry.prefix ?? 'omnilog.drain'}.${metric}`,
      value,
      ts: new Date().toISOString(),
      ...(Object.keys(mergedTags).length > 0 ? { tags: mergedTags } : {}),
    };

    try {
      const result = this.telemetry.sink(telemetryEvent);
      void Promise.resolve(result).catch((error) => {
        console.error('Drain telemetry sink error:', error);
      });
    } catch (error) {
      console.error('Drain telemetry sink error:', error);
    }
  }

  private ApplyBackpressure(): boolean | Promise<boolean> {
    if (!Number.isFinite(this.maxQueueSize)) return true;

    while (this.events.length >= this.maxQueueSize) {
      switch (this.queueStrategy) {
        case 'drop-oldest': {
          this.events.shift();
          this.EmitTelemetry('dropped', 1, { reason: 'drop-oldest' });
          return true;
        }
        case 'drop-newest': {
          this.EmitTelemetry('dropped', 1, { reason: 'drop-newest' });
          return false;
        }
        case 'sample': {
          if (!this.ShouldKeepSampledEvent()) {
            this.EmitTelemetry('dropped', 1, { reason: 'sampled-out' });
            return false;
          }
          this.events.shift();
          this.EmitTelemetry('dropped', 1, { reason: 'sample-evict-oldest' });
          return true;
        }
        case 'block': {
          return this.WaitForQueueSpace().then(() => this.ApplyBackpressure());
        }
      }
    }

    return true;
  }

  private Enqueue(event: Envelope<Context, Payload>): void {
    this.events.push(event);
    this.EmitTelemetry('queued', 1, { queueSize: String(this.events.length) });

    if (this.events.length >= this.batchSize) {
      void this.Flush();
      return;
    }

    this.ScheduleFlush();
  }

  private ShouldKeepSampledEvent(): boolean {
    return Math.random() <= this.queueSampleRate;
  }

  private WaitForQueueSpace(): Promise<void> {
    return new Promise((resolve) => {
      this.waitingForSpaceResolvers.push(resolve);
    });
  }

  private NotifyQueueSpace(): void {
    if (this.waitingForSpaceResolvers.length === 0) return;

    const waitingResolvers = this.waitingForSpaceResolvers.splice(0);
    for (const resolve of waitingResolvers) {
      resolve();
    }
  }

  private async SendWithRetry(batch: Envelope<Context, Payload>[]): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt += 1) {
      try {
        await this.SendWithTimeout(batch);
        return;
      } catch (error) {
        lastError = error;

        if (attempt >= this.retryConfig.maxAttempts) {
          break;
        }

        this.EmitTelemetry('retry', 1, { attempt: String(attempt + 1) });
        await Sleep(this.CalculateRetryDelayMs(attempt));
      }
    }

    throw (
      lastError ??
      CreateDomainError('drain', 'DRAIN_HTTP_FAILURE', 'Drain send failed after retries', {
        retryable: false,
      })
    );
  }

  private async PublishDeadLetter(
    batch: Envelope<Context, Payload>[],
    error: unknown,
  ): Promise<void> {
    if (!this.deadLetterSink) return;

    const failurePayload: DrainFailure<Context, Payload> = {
      reason: 'delivery-failed',
      attempts: this.retryConfig.maxAttempts,
      failedAt: new Date().toISOString(),
      events: batch,
      ...(error instanceof Error ? { error: error.message } : {}),
    };

    try {
      const result = this.deadLetterSink(failurePayload);
      await Promise.resolve(result);
      this.EmitTelemetry('dead-letter', batch.length, {
        attempts: String(this.retryConfig.maxAttempts),
      });
    } catch (deadLetterError) {
      console.error('Dead-letter sink error:', deadLetterError);
    }
  }

  private async SendWithTimeout(batch: Envelope<Context, Payload>[]): Promise<void> {
    const timeoutMs = this.retryConfig.perAttemptTimeoutMs;
    if (timeoutMs === undefined) {
      await this.drain(batch);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const sendPromise = Promise.resolve(this.drain(batch));
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          CreateDomainError('drain', 'DRAIN_TIMEOUT', `Drain send timed out after ${timeoutMs}ms`, {
            details: { timeoutMs },
            retryable: true,
          }),
        );
      }, timeoutMs);
    });

    try {
      await Promise.race([sendPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private CalculateRetryDelayMs(attempt: number): number {
    const baseDelay = this.retryConfig.baseDelayMs * 2 ** Math.max(0, attempt - 1);
    const clampedDelay = Math.min(baseDelay, this.retryConfig.maxDelayMs);
    if (this.retryConfig.jitter === 'full') {
      return Math.random() * clampedDelay;
    }
    return clampedDelay;
  }
}

function Sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
