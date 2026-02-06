import { describe, expect, it, vi } from 'vitest';
import { Drain } from '../src/index.js';
import { CreateWebhookDrain } from '../src/drains.js';
import type { DrainFailure } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.WebhookSink', function DrainWebhookSinkSuite() {
  it('sends payload and dead-letters failures', async function SendsPayloadAndDeadLettersFailures() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(
      async () => new Response(null, { status: 500, statusText: 'Boom' }),
    );
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deadLetterEvents: DrainFailure[] = [];

    const drain = Drain.WebhookSink({
      url: 'https://example.com/webhook',
      batchSize: 10,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
      deadLetterSink: (failure) => {
        deadLetterEvents.push(failure);
      },
    });

    drain.Sink(CreateEvent('drain.webhook.failed'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body ?? '[]'));
    expect(body).toHaveLength(1);
    expect(deadLetterEvents).toHaveLength(1);
    expect(String(errorSpy.mock.calls[0]?.[0] ?? '')).toContain('Webhook drain error');

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('flushes when batch size is reached', async function FlushesWhenBatchSizeIsReached() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.WebhookSink({
      url: 'https://example.com/webhook',
      batchSize: 2,
      flushInterval: 60_000,
    });

    await Promise.resolve(drain.Sink(CreateEvent('drain.batch.one')));
    await Promise.resolve(drain.Sink(CreateEvent('drain.batch.two')));
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body ?? '[]'));
    expect(body).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it('retries failed batches before succeeding', async function RetriesFailedBatchesBeforeSucceeding() {
    let attempts = 0;
    const fetchSpy = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response(null, { status: 500, statusText: 'retry' });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const drain = Drain.WebhookSink({
      url: 'https://example.com/webhook',
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    });

    drain.Sink(CreateEvent('drain.retry'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('drops oldest events when queue is full', async function DropsOldestEventsWhenQueueIsFull() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.WebhookSink({
      url: 'https://example.com/webhook',
      batchSize: 10,
      flushInterval: 60_000,
      queue: { maxItems: 2, strategy: 'drop-oldest' },
    });

    await Promise.resolve(drain.Sink(CreateEvent('drain.one')));
    await Promise.resolve(drain.Sink(CreateEvent('drain.two')));
    await Promise.resolve(drain.Sink(CreateEvent('drain.three')));
    await drain.Flush();

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const batch = JSON.parse(String(init?.body ?? '[]')) as Array<{ name: string }>;
    expect(batch.map((event) => event.name)).toEqual(['drain.two', 'drain.three']);
    vi.unstubAllGlobals();
  });

  it('emits telemetry for queued and sent events', async function EmitsTelemetryForQueuedAndSentEvents() {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const telemetryEvents: Array<{ metric: string; value: number }> = [];
    const drain = Drain.WebhookSink({
      url: 'https://example.com/webhook',
      batchSize: 10,
      flushInterval: 60_000,
      telemetry: {
        sink: (event) => {
          telemetryEvents.push({ metric: event.metric, value: event.value });
        },
      },
    });

    drain.Sink(CreateEvent('drain.telemetry'));
    await drain.Flush();

    expect(telemetryEvents.some((event) => event.metric === 'typedlog.drain.queued')).toBe(true);
    expect(telemetryEvents.some((event) => event.metric === 'typedlog.drain.sent')).toBe(true);
    expect(telemetryEvents.some((event) => event.metric === 'typedlog.drain.flushDurationMs')).toBe(
      true,
    );
    vi.unstubAllGlobals();
  });

  it('sends failed batches to dead-letter sink', async function SendsFailedBatchesToDeadLetterSink() {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 500, statusText: 'nope' }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deadLetterEvents: DrainFailure[] = [];

    const drain = Drain.WebhookSink({
      url: 'https://example.com/webhook',
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
      },
      deadLetterSink: (failure) => {
        deadLetterEvents.push(failure);
      },
    });

    drain.Sink(CreateEvent('drain.dead_letter'));
    await drain.Flush();

    expect(deadLetterEvents).toHaveLength(1);
    expect(deadLetterEvents[0]?.attempts).toBe(2);
    expect(deadLetterEvents[0]?.events).toHaveLength(1);
    expect(deadLetterEvents[0]?.reason).toBe('delivery-failed');
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('throws typed error for provider request failures', async function ThrowsTypedErrorForProviderRequestFailures() {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 503, statusText: 'down' }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const webhookDrain = CreateWebhookDrain({
      url: 'https://example.com/webhook',
    });

    await expect(webhookDrain([CreateEvent('drain.webhook.provider')])).rejects.toMatchObject({
      code: 'DRAIN_HTTP_FAILURE',
      domain: 'drain',
      statusCode: 503,
    });

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
