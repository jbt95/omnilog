import { describe, expect, it } from 'vitest';
import {
  Context,
  Drain,
  Error as LogError,
  Handler,
  Middleware,
  Redaction,
  Registry,
  Sink,
  OmniLogModule,
  OmniLogger,
} from '../src/index.js';

describe('Index Exports', function IndexExportsSuite() {
  it('exposes core API', function ExposesCoreApi() {
    expect(typeof OmniLogger.For).toBe('function');
    expect(typeof OmniLogger.Simulate).toBe('function');
    expect(typeof Registry.Create).toBe('function');
    expect(typeof Registry.Export).toBe('function');
    expect(typeof Registry.Compare).toBe('function');
    expect(typeof Sink.Memory).toBe('function');
    expect(typeof Sink.Structured).toBe('function');
    expect(typeof Drain.AxiomSink).toBe('function');
    expect(typeof Drain.OTLPSink).toBe('function');
    expect(typeof Drain.WebhookSink).toBe('function');
    expect(typeof Drain.DatadogSink).toBe('function');
    expect(typeof Drain.LokiSink).toBe('function');
    expect(typeof Drain.BetterStackSink).toBe('function');
    expect(typeof Drain.DeadLetterFile).toBe('function');
    expect(typeof Drain.FileSource).toBe('function');
    expect(typeof Context.Create).toBe('function');
    expect(typeof Context.Runtime).toBe('function');
    expect(typeof Context.Region).toBe('function');
    expect(typeof Context.RequestHeaders).toBe('function');
    expect(typeof Context.Request).toBe('function');
    expect(typeof Context.Extract).toBe('function');
    expect(typeof Middleware.Express).toBe('function');
    expect(typeof Middleware.Hono).toBe('function');
    expect(typeof Handler.Lambda).toBe('function');
    expect(typeof Handler.Worker).toBe('function');
    expect(typeof OmniLogModule.forRoot).toBe('function');
    expect(typeof Redaction.Policy).toBe('function');
    expect(typeof LogError.Create).toBe('function');
    expect(typeof LogError.Parse).toBe('function');
    expect(typeof LogError.Domain).toBe('function');
  });
});
