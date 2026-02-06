import type { Drain, DrainConfig } from '../types.js';
import { CreateDomainError } from '../error.js';

/**
 * Create an Axiom drain.
 */
export function CreateAxiomDrain(config: DrainConfig): Drain {
  const endpoint = config.endpoint ?? process.env.AXIOM_ENDPOINT;
  const apiKey = config.apiKey ?? process.env.AXIOM_TOKEN;
  const dataset = config.dataset ?? process.env.AXIOM_DATASET;

  return async (events) => {
    if (!endpoint || !apiKey || !dataset) {
      console.warn('Axiom drain: missing configuration', {
        code: 'DRAIN_CONFIGURATION_MISSING',
        domain: 'drain',
        provider: 'axiom',
      });
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
        throw CreateDomainError('drain', 'DRAIN_HTTP_FAILURE', 'Axiom drain request failed', {
          statusCode: response.status,
          details: { provider: 'axiom', statusText: response.statusText, endpoint },
          retryable: response.status >= 500,
        });
      }
    } catch (error) {
      console.error('Axiom drain error:', error);
      throw error;
    }
  };
}
