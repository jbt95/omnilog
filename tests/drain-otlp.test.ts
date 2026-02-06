import { describe, expect, it, vi } from 'vitest';
import { Drain } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.OTLPSink', function DrainOtlpSinkSuite() {
  it('sends logs to OTLP endpoint', async function SendsLogsToOtlpEndpoint() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.OTLPSink({
      endpoint: 'http://localhost:4318',
      batchSize: 10,
      flushInterval: 60_000,
    });

    drain.Sink(CreateEvent('drain.otlp'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(url).toBe('http://localhost:4318/v1/logs');

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(init?.body ?? '{}')) as {
      resourceLogs: Array<{
        scopeLogs: Array<{
          logRecords: Array<{ severityText: string; body: { stringValue: string } }>;
        }>;
      }>;
    };

    expect(payload.resourceLogs).toHaveLength(1);
    const record = payload.resourceLogs[0]?.scopeLogs[0]?.logRecords[0];
    expect(record?.severityText).toBe('INFO');

    const body = JSON.parse(String(record?.body?.stringValue ?? '{}')) as Record<string, unknown>;
    expect(body.name).toBe('drain.otlp');

    vi.unstubAllGlobals();
  });
});
