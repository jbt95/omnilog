import { createAdaptorServer } from '@hono/node-server';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Middleware } from '../../src/index.js';
import { CreateLoggerFixture } from './helpers/logger-fixture.js';
import { GetJson } from './helpers/http.js';
import { StartServer } from './helpers/server.js';

type IntegrationLogger = {
  Emit: (name: 'integration.request', payload: { route: string }) => void;
};

describe('Hono E2E', function HonoE2ESuite() {
  let baseUrl = '';
  let closeServer: (() => Promise<void>) | undefined;
  let memory: ReturnType<typeof CreateLoggerFixture>['memory'];

  beforeEach(async function SetupHonoApp() {
    const fixture = CreateLoggerFixture();
    memory = fixture.memory;

    const app = new Hono();
    app.use(
      '*',
      Middleware.Hono(fixture.loggerFactory, {
        GetContext: (context) => ({ userId: context.req.header('x-user-id') }),
      }),
    );

    app.get('/ok', (context) => {
      const logger = (context as unknown as { get: (key: string) => unknown }).get(
        'logger',
      ) as IntegrationLogger;
      logger.Emit('integration.request', { route: '/ok' });
      return context.json({ ok: true });
    });

    app.get('/boom', () => {
      throw new Error('hono boom');
    });

    const server = createAdaptorServer({
      fetch: app.fetch,
    });
    const runningServer = await StartServer(server);
    baseUrl = runningServer.baseUrl;
    closeServer = runningServer.Close;
  });

  afterEach(async function TeardownHonoApp() {
    if (closeServer) {
      await closeServer();
    }
  });

  it('emits request event with mapped context', async function EmitsRequestEventWithMappedContext() {
    const result = await GetJson<{ ok: boolean }>(baseUrl, '/ok', {
      headers: {
        'x-request-id': 'req-hono-ok',
        'x-user-id': 'user-hono',
      },
    });

    expect(result.status).toBe(200);
    expect(result.body?.ok).toBe(true);

    const event = memory.events.find((candidate) => candidate.name === 'integration.request');
    expect(event).toBeDefined();
    expect(event?.context.method).toBe('GET');
    expect(event?.context.path).toBe('/ok');
    expect(event?.context.requestId).toBe('req-hono-ok');
    expect(event?.context.userId).toBe('user-hono');
  });

  it('returns 500 and emits t-log internal error event', async function Returns500AndEmitsInternalErrorEvent() {
    const response = await fetch(new URL('/boom', baseUrl), {
      headers: {
        'x-request-id': 'req-hono-boom',
      },
    });

    expect(response.status).toBe(500);

    const errorEvent = memory.events.find((candidate) => candidate.name === 't-log.internal.error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.hono');
    expect(payload?.message).toBe('hono boom');
  });
});
