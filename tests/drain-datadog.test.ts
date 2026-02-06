import { describe, expect, it, vi } from 'vitest';
import { Drain } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.DatadogSink', function DrainDatadogSinkSuite() {
  it('sends payload with mapped endpoint and headers', async function SendsPayloadWithMappedEndpointAndHeaders() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.DatadogSink({
      apiKey: 'dd-api-key',
      site: 'eu1',
      service: 'checkout-service',
      host: 'checkout-host',
      tags: ['env:test', 'team:core'],
      batchSize: 10,
      flushInterval: 60_000,
    });

    drain.Sink(CreateEvent('drain.datadog'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(url).toBe('https://http-intake.logs.datadoghq.eu/api/v2/logs');

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)['DD-API-KEY']).toBe('dd-api-key');

    const body = JSON.parse(String(init?.body ?? '[]')) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]?.message).toBe('drain.datadog');
    expect(body[0]?.service).toBe('checkout-service');
    expect(body[0]?.hostname).toBe('checkout-host');
    expect(body[0]?.ddsource).toBe('typedlog');
    expect(body[0]?.ddtags).toBe('env:test,team:core');
    expect((body[0]?.typedlog as Record<string, unknown>)?.name).toBe('drain.datadog');

    vi.unstubAllGlobals();
  });

  it('retries on non-2xx responses', async function RetriesOnNon2xxResponses() {
    let attempts = 0;
    const fetchSpy = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response(null, { status: 500, statusText: 'retry' });
      }
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const drain = Drain.DatadogSink({
      apiKey: 'dd-api-key',
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    });

    drain.Sink(CreateEvent('drain.datadog.retry'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
