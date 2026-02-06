import type { DatadogDrainConfig, DatadogSite, Drain } from '../types.js';
import { CreateDomainError } from '../error.js';

function CreateDatadogEndpoint(site: DatadogSite): string {
  const datadogSiteEndpoints: Record<DatadogSite, string> = {
    us1: 'https://http-intake.logs.datadoghq.com/api/v2/logs',
    us3: 'https://http-intake.logs.us3.datadoghq.com/api/v2/logs',
    us5: 'https://http-intake.logs.us5.datadoghq.com/api/v2/logs',
    eu1: 'https://http-intake.logs.datadoghq.eu/api/v2/logs',
    ap1: 'https://http-intake.logs.ap1.datadoghq.com/api/v2/logs',
    ap2: 'https://http-intake.logs.ap2.datadoghq.com/api/v2/logs',
    'us1-fed': 'https://http-intake.logs.ddog-gov.com/api/v2/logs',
  };
  return datadogSiteEndpoints[site];
}

function CreateDatadogTags(tags: DatadogDrainConfig['tags']): string | undefined {
  if (!tags) return undefined;
  if (typeof tags === 'string') {
    return tags.trim().length > 0 ? tags : undefined;
  }
  return tags.length > 0 ? tags.join(',') : undefined;
}

/**
 * Create a Datadog drain.
 */
export function CreateDatadogDrain(config: DatadogDrainConfig): Drain {
  const endpoint = config.endpoint ?? CreateDatadogEndpoint(config.site ?? 'us1');
  const apiKey = config.apiKey ?? process.env.DATADOG_API_KEY;
  const service = config.service ?? process.env.DATADOG_SERVICE;
  const host = config.host ?? process.env.DATADOG_HOST;
  const datadogTags = CreateDatadogTags(config.tags);

  return async (events) => {
    if (!apiKey) {
      console.warn('Datadog drain: missing API key', {
        code: 'DRAIN_CONFIGURATION_MISSING',
        domain: 'drain',
        provider: 'datadog',
      });
      return;
    }

    const payload = events.map((event) => ({
      message: event.name,
      ...(service ? { service } : {}),
      ...(host ? { hostname: host } : {}),
      status: event.level ?? 'info',
      ddsource: 't-log',
      timestamp: event.ts,
      ...(datadogTags ? { ddtags: datadogTags } : {}),
      tLog: event,
    }));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': apiKey,
          ...config.headers,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw CreateDomainError('drain', 'DRAIN_HTTP_FAILURE', 'Datadog drain request failed', {
          statusCode: response.status,
          details: { provider: 'datadog', statusText: response.statusText, endpoint },
          retryable: response.status >= 500,
        });
      }
    } catch (error) {
      console.error('Datadog drain error:', error);
      throw error;
    }
  };
}
