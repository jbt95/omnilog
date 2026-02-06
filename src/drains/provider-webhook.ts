import type { Drain, DrainConfig } from '../types.js';
import { CreateDomainError } from '../error.js';

export type WebhookDrainConfig = DrainConfig & { url: string };

/**
 * Create a webhook drain.
 */
export function CreateWebhookDrain(config: WebhookDrainConfig): Drain {
  return async (events) => {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify(events),
      });

      if (!response.ok) {
        throw CreateDomainError('drain', 'DRAIN_HTTP_FAILURE', 'Webhook drain request failed', {
          statusCode: response.status,
          details: { provider: 'webhook', statusText: response.statusText, endpoint: config.url },
          retryable: response.status >= 500,
        });
      }
    } catch (error) {
      console.error('Webhook drain error:', error);
      throw error;
    }
  };
}
