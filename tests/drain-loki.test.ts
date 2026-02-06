import { describe, expect, it, vi } from 'vitest';
import { Drain } from '../src/index.js';
import type { DrainFailure } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.LokiSink', function DrainLokiSinkSuite() {
  it('sends streams payload with auth and tenant headers', async function SendsStreamsPayloadWithAuthAndTenantHeaders() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.LokiSink({
      endpoint: 'https://loki.example.com/loki/api/v1/push',
      bearerToken: 'loki-token',
      tenantId: 'tenant-1',
      labels: { app: 'omnilog' },
      includeEventNameLabel: true,
      service: 'checkout-service',
      batchSize: 10,
      flushInterval: 60_000,
    });

    drain.Sink(CreateEvent('drain.loki'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer loki-token');
    expect(headers['X-Scope-OrgID']).toBe('tenant-1');

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      streams: Array<{ stream: Record<string, string>; values: Array<[string, string]> }>;
    };
    expect(body.streams).toHaveLength(1);
    expect(body.streams[0]?.stream.app).toBe('omnilog');
    expect(body.streams[0]?.stream.kind).toBe('log');
    expect(body.streams[0]?.stream.event).toBe('drain.loki');
    expect(body.streams[0]?.stream.service).toBe('checkout-service');

    const firstValue = body.streams[0]?.values[0];
    expect(firstValue).toBeDefined();
    expect(firstValue?.[0]).toMatch(/^\d+$/);

    const linePayload = JSON.parse(String(firstValue?.[1] ?? '{}')) as Record<string, unknown>;
    expect(linePayload.message).toBe('drain.loki');
    expect((linePayload.omniLog as Record<string, unknown>)?.name).toBe('drain.loki');

    vi.unstubAllGlobals();
  });

  it('routes failed batches to dead-letter sink', async function RoutesFailedBatchesToDeadLetterSink() {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 500, statusText: 'nope' }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deadLetterEvents: DrainFailure[] = [];

    const drain = Drain.LokiSink({
      endpoint: 'https://loki.example.com/loki/api/v1/push',
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
      },
      deadLetterSink: (failure) => {
        deadLetterEvents.push(failure);
      },
    });

    drain.Sink(CreateEvent('drain.loki.dead_letter'));
    await drain.Flush();

    expect(deadLetterEvents).toHaveLength(1);
    expect(deadLetterEvents[0]?.attempts).toBe(2);
    expect(deadLetterEvents[0]?.events).toHaveLength(1);
    expect(deadLetterEvents[0]?.reason).toBe('delivery-failed');
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
