import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Context } from '../src/index.js';

describe('Context', function ContextSuite() {
  it('runs and retrieves context', function RunsAndRetrievesContext() {
    const contextSchema = z.object({ traceId: z.string(), userId: z.string().optional() });
    const contextManager = Context.Create(contextSchema);

    const result = contextManager.Run({ traceId: 'trace_1' }, () =>
      contextManager.With({ userId: 'user_1' }, () => contextManager.Get()),
    );

    expect(result).toEqual({ traceId: 'trace_1', userId: 'user_1' });
  });

  it('throws typed errors for invalid context', function ThrowsTypedErrorsForInvalidContext() {
    const contextSchema = z.object({ traceId: z.string() });
    const contextManager = Context.Create(contextSchema);

    expect(() =>
      contextManager.Run({ traceId: 1 } as unknown as z.output<typeof contextSchema>, () => null),
    ).toThrowError(
      expect.objectContaining({
        code: 'CONTEXT_INVALID',
        domain: 'context',
      }),
    );
  });
});
