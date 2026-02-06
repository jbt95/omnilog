import { createServer } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Middleware } from '../../src/index.js';
import { CreateLoggerFixture } from './helpers/logger-fixture.js';
import { GetJson } from './helpers/http.js';
import { StartServer } from './helpers/server.js';

type IntegrationLogger = {
  Emit: (name: 'integration.request', payload: { route: string }) => void;
};

describe('Express E2E', function ExpressE2ESuite() {
  let baseUrl = '';
  let closeServer: (() => Promise<void>) | undefined;
  let memory: ReturnType<typeof CreateLoggerFixture>['memory'];

  beforeEach(async function SetupExpressApp() {
    const fixture = CreateLoggerFixture();
    memory = fixture.memory;

    const app = express();
    app.use(
      Middleware.Express(fixture.loggerFactory, {
        GetContext: (request) => ({ userId: request.header('x-user-id') }),
      }),
    );

    app.get('/ok', (request, response) => {
      const logger = (request as unknown as Record<string, unknown>).logger as IntegrationLogger;
      logger.Emit('integration.request', { route: '/ok' });
      response.status(200).json({ ok: true });
    });

    app.get('/boom', () => {
      throw new Error('express boom');
    });

    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ ok: false, message });
    });

    const runningServer = await StartServer(createServer(app));
    baseUrl = runningServer.baseUrl;
    closeServer = runningServer.Close;
  });

  afterEach(async function TeardownExpressApp() {
    if (closeServer) {
      await closeServer();
    }
  });

  it('emits request event with mapped context', async function EmitsRequestEventWithMappedContext() {
    const result = await GetJson<{ ok: boolean }>(baseUrl, '/ok', {
      headers: {
        'x-request-id': 'req-express-ok',
        'x-user-id': 'user-express',
      },
    });

    expect(result.status).toBe(200);
    expect(result.body?.ok).toBe(true);

    const event = memory.events.find((candidate) => candidate.name === 'integration.request');
    expect(event).toBeDefined();
    expect(event?.context.method).toBe('GET');
    expect(event?.context.path).toBe('/ok');
    expect(event?.context.requestId).toBe('req-express-ok');
    expect(event?.context.userId).toBe('user-express');
  });

  it('returns 500 and emits omnilog internal error event', async function Returns500AndEmitsInternalErrorEvent() {
    await GetJson<{ ok: boolean }>(baseUrl, '/ok', {
      headers: {
        'x-request-id': 'req-express-prime',
      },
    });

    const result = await GetJson<{ ok: boolean; message: string }>(baseUrl, '/boom', {
      headers: {
        'x-request-id': 'req-express-boom',
      },
    });

    expect(result.status).toBe(500);
    expect(result.body?.message).toBe('express boom');

    const errorEvent = memory.events.find((candidate) => candidate.name === 'omnilog.internal.error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.express');
    expect(payload?.message).toBe('express boom');
  });
});
