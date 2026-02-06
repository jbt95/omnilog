import { describe, expect, it, vi } from 'vitest';
import { Drain } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.AxiomSink', function DrainAxiomSinkSuite() {
  it('skips when configuration is missing', async function SkipsWhenConfigurationIsMissing() {
    const envSnapshot = {
      AXIOM_ENDPOINT: process.env.AXIOM_ENDPOINT,
      AXIOM_TOKEN: process.env.AXIOM_TOKEN,
      AXIOM_DATASET: process.env.AXIOM_DATASET,
    };

    delete process.env.AXIOM_ENDPOINT;
    delete process.env.AXIOM_TOKEN;
    delete process.env.AXIOM_DATASET;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.AxiomSink({
      batchSize: 1,
      flushInterval: 60_000,
    });
    drain.Sink(CreateEvent('drain.axiom.missing'));
    await drain.Flush();

    expect(warnSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    process.env.AXIOM_ENDPOINT = envSnapshot.AXIOM_ENDPOINT;
    process.env.AXIOM_TOKEN = envSnapshot.AXIOM_TOKEN;
    process.env.AXIOM_DATASET = envSnapshot.AXIOM_DATASET;
  });

  it('flushes pending events from sink handle', async function FlushesPendingEventsFromSinkHandle() {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const drain = Drain.AxiomSink({
      endpoint: 'https://axiom.example',
      apiKey: 'token',
      dataset: 'dataset',
      batchSize: 10,
      flushInterval: 60_000,
    });

    drain.Sink(CreateEvent('drain.axiom'));
    await drain.Flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
