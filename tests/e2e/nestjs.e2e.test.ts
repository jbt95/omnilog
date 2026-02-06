import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Controller, Get, Module, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypedLogModule } from '../../src/index.js';
import { CreateLoggerFixture } from './helpers/logger-fixture.js';
import { GetJson } from './helpers/http.js';

type IntegrationLogger = {
  Emit: (name: 'integration.request', payload: { route: string }) => void;
};

type LoggerFactoryFixture = ReturnType<typeof CreateLoggerFixture>['loggerFactory'];

function CreateTestModule(loggerFactory: LoggerFactoryFixture) {
  @Controller()
  class TestController {
    @Get('/ok')
    Ok(@Req() request: Request) {
      const logger = (request as unknown as Record<string, unknown>).logger as IntegrationLogger;
      logger.Emit('integration.request', { route: '/ok' });
      return { ok: true };
    }

    @Get('/boom')
    Boom() {
      throw new Error('nest boom');
    }
  }

  @Module({
    imports: [
      TypedLogModule.forRoot({
        loggerFactory,
        GetContext: (request) => ({ userId: request.header('x-user-id') }),
      }),
    ],
    controllers: [TestController],
  })
  class TestAppModule {}

  return TestAppModule;
}

describe('NestJS E2E', function NestjsE2ESuite() {
  let app: INestApplication | undefined;
  let baseUrl = '';
  let memory: ReturnType<typeof CreateLoggerFixture>['memory'];

  beforeEach(async function SetupNestApp() {
    const fixture = CreateLoggerFixture();
    memory = fixture.memory;

    const moduleRef = await Test.createTestingModule({
      imports: [CreateTestModule(fixture.loggerFactory)],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async function TeardownNestApp() {
    if (app) {
      await app.close();
    }
  });

  it('emits request event with mapped context', async function EmitsRequestEventWithMappedContext() {
    const result = await GetJson<{ ok: boolean }>(baseUrl, '/ok', {
      headers: {
        'x-request-id': 'req-nest-ok',
        'x-user-id': 'user-nest',
      },
    });

    expect(result.status).toBe(200);
    expect(result.body?.ok).toBe(true);

    const event = memory.events.find((candidate) => candidate.name === 'integration.request');
    expect(event).toBeDefined();
    expect(event?.context.method).toBe('GET');
    expect(event?.context.path).toBe('/ok');
    expect(event?.context.requestId).toBe('req-nest-ok');
    expect(event?.context.userId).toBe('user-nest');
  });

  it('returns 500 and emits typedlog internal error event', async function Returns500AndEmitsInternalErrorEvent() {
    const response = await fetch(new URL('/boom', baseUrl), {
      headers: {
        'x-request-id': 'req-nest-boom',
      },
    });

    expect(response.status).toBeGreaterThanOrEqual(500);

    const errorEvent = memory.events.find((candidate) => candidate.name === 'typedlog.internal.error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent?.payload as Record<string, unknown> | undefined;
    expect(payload?.source).toBe('integration.nestjs');
    expect(payload?.message).toBe('nest boom');
  });
});
