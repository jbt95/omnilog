import type { Drain, DrainConfig } from '../types.js';

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
        throw new Error(`Webhook drain failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Webhook drain error:', error);
      throw error;
    }
  };
}
