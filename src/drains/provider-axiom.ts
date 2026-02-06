import type { Drain, DrainConfig } from '../types.js';

/**
 * Create an Axiom drain.
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
        throw new Error(`Axiom drain failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Axiom drain error:', error);
      throw error;
    }
  };
}
