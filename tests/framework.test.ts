import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AutoFlush, CreateRequestContext, ExtractRequestContext } from '../src/index.js';

describe('Framework', function FrameworkSuite() {
  it('extracts request context and runs', function ExtractsRequestContextAndRuns() {
    const contextSchema = z.object({ userId: z.string() }).passthrough();
    const contextManager = CreateRequestContext(contextSchema);
    const request = new Request('https://example.com/orders?x=1', {
      method: 'POST',
      headers: {
        'x-request-id': 'req_1',
        'user-agent': 'agent_1',
      },
    });

    const requestContext = ExtractRequestContext(request);

    const result = contextManager.Run({ ...requestContext, userId: 'user_1' }, () =>
      contextManager.Get(),
    );

    expect(result?.method).toBe('POST');
    expect(result?.path).toBe('/orders');
    expect(result?.requestId).toBe('req_1');
    expect(result?.userAgent).toBe('agent_1');
    expect(result?.userId).toBe('user_1');
  });

  it('adds auto flush disposal', async function AddsAutoFlushDisposal() {
    const target = {
      flushCount: 0,
      async Flush() {
        this.flushCount += 1;
      },
    };

    const logger = AutoFlush(target);
    await logger.Dispose();

    expect(target.flushCount).toBe(1);

    const asyncDispose = logger[Symbol.asyncDispose];
    if (asyncDispose) {
      await asyncDispose();
    }

    expect(target.flushCount).toBe(2);
  });
});
