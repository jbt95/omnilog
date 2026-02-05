import { describe, expect, it } from 'vitest';
import {
  Context,
  Drain,
  Error as LogError,
  Redaction,
  Registry,
  Sink,
  TypedLogger,
} from '../src/index.js';

describe('Index Exports', function IndexExportsSuite() {
  it('exposes core API', function ExposesCoreApi() {
    expect(typeof TypedLogger.For).toBe('function');
    expect(typeof Registry.Create).toBe('function');
    expect(typeof Registry.Export).toBe('function');
    expect(typeof Sink.Memory).toBe('function');
    expect(typeof Sink.Structured).toBe('function');
    expect(typeof Drain.Axiom).toBe('function');
    expect(typeof Drain.Webhook).toBe('function');
    expect(typeof Drain.AxiomSink).toBe('function');
    expect(typeof Drain.OTLPSink).toBe('function');
    expect(typeof Drain.WebhookSink).toBe('function');
    expect(typeof Context.Create).toBe('function');
    expect(typeof Context.Request).toBe('function');
    expect(typeof Context.Extract).toBe('function');
    expect(typeof Redaction.Policy).toBe('function');
    expect(typeof LogError.Create).toBe('function');
    expect(typeof LogError.Parse).toBe('function');
  });
});
