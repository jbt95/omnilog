import type { Envelope } from '../src/index.js';

export function CreateEvent(name: string): Envelope<unknown, unknown> {
  return {
    kind: 'log',
    name,
    ts: new Date().toISOString(),
    schema: { fingerprint: name },
    context: { traceId: `trace_${name}` },
    payload: { ok: true },
  };
}
