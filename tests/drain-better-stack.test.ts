import { describe, expect, it, vi } from 'vitest';
import { Drain } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.BetterStackSink', function DrainBetterStackSinkSuite() {
  it('sends ndjson payload with bearer auth', async function SendsNdjsonPayloadWithBearerAuth() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.BetterStackSink({
      endpoint: 'https://in.logs.betterstack.com',
      sourceToken: 'better-token',
      service: 'checkout-service',
      host: 'checkout-host',
      source: 't-log',
      batchSize: 10,
      flushInterval: 60_000,
    });

    drain.Sink(CreateEvent('drain.betterstack'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer better-token');
    expect(headers['Content-Type']).toBe('application/x-ndjson');

    const body = String(init?.body ?? '');
    const lines = body.trim().split('\n');
    expect(lines).toHaveLength(1);

    const linePayload = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(linePayload.message).toBe('drain.betterstack');
    expect(linePayload.service).toBe('checkout-service');
    expect(linePayload.host).toBe('checkout-host');
    expect(linePayload.source).toBe('t-log');
    expect((linePayload.tLog as Record<string, unknown>)?.name).toBe('drain.betterstack');

    vi.unstubAllGlobals();
  });
});
