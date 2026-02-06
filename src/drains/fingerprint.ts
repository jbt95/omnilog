import { createHash } from 'node:crypto';
import type { Envelope } from '../types.js';

/**
 * Create a unique fingerprint for an event.
 */
export function CreateFingerprint(event: Envelope<unknown, unknown>): string {
  const content = `${event.name}:${event.ts}:${JSON.stringify(event.payload)}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
