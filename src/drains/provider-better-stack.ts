import type { BetterStackDrainConfig, Drain, Envelope } from '../types.js';

function CreateBetterStackNdjson(
  events: Envelope<unknown, unknown>[],
  config: BetterStackDrainConfig,
): string {
  const lines = events.map((event) =>
    JSON.stringify({
      dt: event.ts,
      message: event.name,
      ...(event.level ? { level: event.level } : {}),
      ...(config.service ? { service: config.service } : {}),
      ...(config.host ? { host: config.host } : {}),
      ...(config.source ? { source: config.source } : {}),
      typedlog: event,
    }),
  );

  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

/**
 * Create a Better Stack drain.
 */
export function CreateBetterStackDrain(config: BetterStackDrainConfig): Drain {
  const endpoint =
    config.endpoint ?? process.env.BETTERSTACK_ENDPOINT ?? 'https://in.logs.betterstack.com';
  const sourceToken = config.sourceToken ?? process.env.BETTERSTACK_SOURCE_TOKEN;

  return async (events) => {
    if (!sourceToken) {
      console.warn('Better Stack drain: missing source token');
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-ndjson',
          Authorization: `Bearer ${sourceToken}`,
          ...config.headers,
        },
        body: CreateBetterStackNdjson(events as Envelope<unknown, unknown>[], config),
      });

      if (!response.ok) {
        throw new Error(`Better Stack drain failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Better Stack drain error:', error);
      throw error;
    }
  };
}
