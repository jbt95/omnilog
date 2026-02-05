import { describe, expect, it, vi } from 'vitest';
import { stdout } from 'node:process';
import {
  Sink,
} from '../src/index.js';
import type { Envelope } from '../src/index.js';

describe('Sinks', function SinksSuite() {
  it('writes structured sink output', function WritesStructuredSinkOutput() {
    const writeSpy = vi.spyOn(stdout, 'write').mockImplementation(() => true);
    const sink = Sink.Structured();
    const event: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'sink.structured',
      ts: new Date().toISOString(),
      schema: { fingerprint: 'abc' },
      context: { traceId: 'trace_structured' },
      payload: { ok: true },
    };

    sink(event);

    const output = String(writeSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(output.trim());
    expect(parsed.name).toBe('sink.structured');
    expect(parsed.context.traceId).toBe('trace_structured');

    writeSpy.mockRestore();
  });

  it('writes visual sink output', function WritesVisualSinkOutput() {
    const writeSpy = vi.spyOn(stdout, 'write').mockImplementation(() => true);
    const sink = Sink.Visual();
    const event: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'sink.visual',
      ts: new Date().toISOString(),
      schema: { fingerprint: 'def' },
      context: { traceId: 'trace_visual' },
      payload: { ok: true },
      level: 'info' as const,
    };

    sink(event);

    const output = String(writeSpy.mock.calls[0]?.[0] ?? '');
    expect(output).toContain('INFO');
    expect(output).toContain('sink.visual');

    writeSpy.mockRestore();
  });

  it('uses structured sink in production mode', function UsesStructuredSinkInProductionMode() {
    const writeSpy = vi.spyOn(stdout, 'write').mockImplementation(() => true);
    const sink = Sink.Environment({ development: false });
    const event: Envelope<unknown, unknown> = {
      kind: 'log',
      name: 'sink.env',
      ts: new Date().toISOString(),
      schema: { fingerprint: 'ghi' },
      context: { traceId: 'trace_env' },
      payload: { ok: true },
    };

    sink(event);

    const output = String(writeSpy.mock.calls[0]?.[0] ?? '');
    expect(() => JSON.parse(output.trim())).not.toThrow();

    writeSpy.mockRestore();
  });
});
