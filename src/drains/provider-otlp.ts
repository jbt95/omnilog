import type { Drain, DrainConfig } from '../types.js';

function CreateOtlpTimeUnixNano(timestamp: string): string {
  const milliseconds = Date.parse(timestamp);
  if (Number.isNaN(milliseconds)) {
    return '0';
  }
  return (BigInt(milliseconds) * 1000000n).toString();
}

/**
 * Create an OTLP drain for OpenTelemetry.
 */
export function CreateOTLPDrain(config: DrainConfig): Drain {
  const endpoint = config.endpoint ?? process.env.OTLP_ENDPOINT ?? 'http://localhost:4318';

  return async (events) => {
    try {
      const response = await fetch(`${endpoint}/v1/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          resourceLogs: events.map((event) => ({
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'typedlog' } }],
            },
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: CreateOtlpTimeUnixNano(event.ts),
                    severityText: event.level?.toUpperCase() ?? 'INFO',
                    body: { stringValue: JSON.stringify(event) },
                    attributes: Object.entries(event.context as Record<string, unknown>).map(
                      ([key, value]) => ({
                        key,
                        value: { stringValue: JSON.stringify(value) },
                      }),
                    ),
                  },
                ],
              },
            ],
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`OTLP drain failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('OTLP drain error:', error);
      throw error;
    }
  };
}
