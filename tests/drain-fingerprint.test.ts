import { describe, expect, it } from 'vitest';
import { Drain } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.Fingerprint', function DrainFingerprintSuite() {
  it('creates deterministic fingerprints', function CreatesDeterministicFingerprints() {
    const eventA = CreateEvent('fingerprint.event');
    const eventB = {
      ...CreateEvent('fingerprint.event'),
      ts: eventA.ts,
    };

    const fingerprintA = Drain.Fingerprint(eventA);
    const fingerprintB = Drain.Fingerprint(eventB);

    expect(fingerprintA).toBe(fingerprintB);
    expect(fingerprintA).toHaveLength(16);
  });
});
