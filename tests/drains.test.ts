import { describe, expect, it, vi } from 'vitest';
import {
  BatchedDrain,
  CreateAxiomDrain,
  CreateFingerprint,
  CreateWebhookDrain,
} from '../src/index.js';
import type { Envelope } from '../src/index.js';

describe('Drains', function DrainsSuite() {
  it('skips Axiom drain when configuration is missing', async function SkipsAxiomDrainWhenConfigurationIsMissing() {
    const envSnapshot = {
      AXIOM_ENDPOINT: process.env.AXIOM_ENDPOINT,
      AXIOM_TOKEN: process.env.AXIOM_TOKEN,
      AXIOM_DATASET: process.env.AXIOM_DATASET,
    };

    delete process.env.AXIOM_ENDPOINT;
    delete process.env.AXIOM_TOKEN;
    delete process.env.AXIOM_DATASET;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = CreateAxiomDrain({});
    const event: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'drain.axiom',
      ts: new Date().toISOString(),
      schema: { fingerprint: 'axiom' },
      context: { traceId: 'trace_1' },
      payload: { ok: true },
    };
    await drain([event]);

    expect(warnSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    vi.unstubAllGlobals();

    process.env.AXIOM_ENDPOINT = envSnapshot.AXIOM_ENDPOINT;
    process.env.AXIOM_TOKEN = envSnapshot.AXIOM_TOKEN;
    process.env.AXIOM_DATASET = envSnapshot.AXIOM_DATASET;
  });

  it('sends webhook drain payload and reports failures', async function SendsWebhookDrainPayloadAndReportsFailures() {
    type FetchMock = (input: unknown, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchMock>(async () =>
      new Response(null, { status: 500, statusText: 'Boom' }),
    );
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const drain = CreateWebhookDrain({
      url: 'https://example.com/webhook',
      headers: { 'X-Test': '1' },
    });

    const event: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'drain.webhook',
      ts: new Date().toISOString(),
      schema: { fingerprint: 'webhook' },
      context: { traceId: 'trace_webhook' },
      payload: { ok: true },
    };
    await drain([event]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body ?? '[]'));
    expect(body).toHaveLength(1);
    const errorMessage = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expect(errorMessage).toContain('Webhook drain failed');

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('batches events and flushes on size', async function BatchesEventsAndFlushesOnSize() {
    const batches: Array<Array<unknown>> = [];
    function Drain(events: Array<unknown>) {
      batches.push(events);
    }
    const batched = new BatchedDrain(Drain, { batchSize: 2, flushInterval: 60000 });

    const eventA: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'drain.batch',
      ts: new Date().toISOString(),
      schema: { fingerprint: 'batch_1' },
      context: { traceId: 'trace_batch_1' },
      payload: { ok: true },
    };
    const eventB: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'drain.batch',
      ts: new Date().toISOString(),
      schema: { fingerprint: 'batch_2' },
      context: { traceId: 'trace_batch_2' },
      payload: { ok: true },
    };
    batched.Add(eventA);
    batched.Add(eventB);

    await Promise.resolve();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it('creates deterministic fingerprints', function CreatesDeterministicFingerprints() {
    const eventA: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'fingerprint.event',
      ts: '2024-01-01T00:00:00.000Z',
      schema: { fingerprint: 'base' },
      context: { traceId: 'trace_1' },
      payload: { ok: true },
    };
    const eventB: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'fingerprint.event',
      ts: '2024-01-01T00:00:00.000Z',
      schema: { fingerprint: 'base' },
      context: { traceId: 'trace_1' },
      payload: { ok: true },
    };

    const fingerprintA = CreateFingerprint(eventA);
    const fingerprintB = CreateFingerprint(eventB);

    expect(fingerprintA).toBe(fingerprintB);
    expect(fingerprintA).toHaveLength(16);
  });
});
