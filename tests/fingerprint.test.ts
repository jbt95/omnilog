import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DefineEvent } from '../src/index.js';

describe('Fingerprint', function FingerprintSuite() {
  it('keeps schema fingerprints stable', function KeepsSchemaFingerprintsStable() {
    const schema = z.object({ id: z.string(), count: z.number() });
    const eventA = DefineEvent('a', schema, { kind: 'log' });
    const eventB = DefineEvent('b', schema, { kind: 'log' });
    const eventC = DefineEvent('c', z.object({ id: z.string() }), { kind: 'log' });

    expect(eventA.fingerprint).toBe(eventB.fingerprint);
    expect(eventA.fingerprint).not.toBe(eventC.fingerprint);
  });
});
