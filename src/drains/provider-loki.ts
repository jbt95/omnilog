import type { Drain, Envelope, LokiDrainConfig } from '../types.js';
import { CreateDomainError } from '../error.js';

type LokiStream = {
  stream: Record<string, string>;
  values: Array<[string, string]>;
};

function CreateNanosecondsTimestamp(isoTs: string): string {
  const milliseconds = Date.parse(isoTs);
  if (Number.isNaN(milliseconds)) {
    return '0';
  }
  return (BigInt(milliseconds) * 1000000n).toString();
}

function CreateLokiStreamLabels(
  event: Envelope<unknown, unknown>,
  config: LokiDrainConfig,
): Record<string, string> {
  const labels: Record<string, string> = {
    ...(config.labels ?? {}),
    kind: event.kind,
  };

  if (event.level) {
    labels.level = event.level;
  }
  if (config.includeEventNameLabel) {
    labels.event = event.name;
  }
  if (config.service) {
    labels.service = config.service;
  }

  return labels;
}

function CreateLokiStreamKey(labels: Record<string, string>): string {
  const sortedEntries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(sortedEntries);
}

function CreateLokiStreams(
  events: Envelope<unknown, unknown>[],
  config: LokiDrainConfig,
): LokiStream[] {
  const streamsByKey = new Map<string, LokiStream>();

  for (const event of events) {
    const labels = CreateLokiStreamLabels(event, config);
    const key = CreateLokiStreamKey(labels);

    const line = JSON.stringify({
      message: event.name,
      ...(event.level ? { level: event.level } : {}),
      omniLog: event,
    });
    const value: [string, string] = [CreateNanosecondsTimestamp(event.ts), line];

    const existingStream = streamsByKey.get(key);
    if (existingStream) {
      existingStream.values.push(value);
      continue;
    }

    streamsByKey.set(key, {
      stream: labels,
      values: [value],
    });
  }

  return [...streamsByKey.values()];
}

/**
 * Create a Loki drain.
 */
export function CreateLokiDrain(config: LokiDrainConfig): Drain {
  const endpoint =
    config.endpoint ?? process.env.LOKI_ENDPOINT ?? 'http://localhost:3100/loki/api/v1/push';

  return async (events) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (config.bearerToken) {
      headers.Authorization = `Bearer ${config.bearerToken}`;
    } else if (config.basicAuth) {
      const encodedCredentials = Buffer.from(
        `${config.basicAuth.username}:${config.basicAuth.password}`,
      ).toString('base64');
      headers.Authorization = `Basic ${encodedCredentials}`;
    }

    if (config.tenantId) {
      headers['X-Scope-OrgID'] = config.tenantId;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          streams: CreateLokiStreams(events as Envelope<unknown, unknown>[], config),
        }),
      });

      if (!response.ok) {
        throw CreateDomainError('drain', 'DRAIN_HTTP_FAILURE', 'Loki drain request failed', {
          statusCode: response.status,
          details: { provider: 'loki', statusText: response.statusText, endpoint },
          retryable: response.status >= 500,
        });
      }
    } catch (error) {
      console.error('Loki drain error:', error);
      throw error;
    }
  };
}
