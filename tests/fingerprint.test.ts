import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Registry } from '../src/index.js';

describe('Fingerprint', function FingerprintSuite() {
  it('keeps schema fingerprints stable', function KeepsSchemaFingerprintsStable() {
    const schema = z.object({ id: z.string(), count: z.number() });
    const contextSchema = z.object({ traceId: z.string().optional() });
    const registry = Registry.Create(
      contextSchema,
      (registry) =>
        [
          registry.DefineEvent('a', schema, { kind: 'log' }),
          registry.DefineEvent('b', schema, { kind: 'log' }),
          registry.DefineEvent('c', z.object({ id: z.string() }), { kind: 'log' }),
        ] as const,
    );

    const [eventA, eventB, eventC] = registry.events;
    expect(eventA.fingerprint).toBe(eventB.fingerprint);
    expect(eventA.fingerprint).not.toBe(eventC.fingerprint);
  });
});
