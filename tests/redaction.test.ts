import { describe, expect, it } from 'vitest';
import { Redaction } from '../src/index.js';

describe('Redaction', function RedactionSuite() {
  it('applies strict redaction mode', function AppliesStrictRedactionMode() {
    const policy = Redaction.Policy('strict');
    const data = { email: 'test@example.com', password: 'secret123' };
    const tags: Record<string, 'pii' | 'secret' | 'token'> = {
      email: 'pii',
      password: 'secret',
    };

    const redacted = policy.Apply(data, tags);

    expect(redacted.email).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
  });

  it('applies lenient redaction mode', function AppliesLenientRedactionMode() {
    const policy = Redaction.Policy('lenient');
    const data = { email: 'test@example.com', password: 'secret123' };
    const tags: Record<string, 'pii' | 'secret' | 'token'> = {
      email: 'pii',
      password: 'secret',
    };

    const redacted = policy.Apply(data, tags);

    expect(redacted.email).toBe('test@example.com');
    expect(redacted.password).toBe('[FILTERED]');
  });

  it('applies dev redaction mode', function AppliesDevRedactionMode() {
    const policy = Redaction.Policy('dev');
    const data = { email: 'test@example.com', password: 'secret123', token: 'abc' };
    const tags: Record<string, 'pii' | 'secret' | 'token'> = {
      email: 'pii',
      password: 'secret',
      token: 'token',
    };

    const redacted = policy.Apply(data, tags);

    expect(redacted.email).toBe('test@example.com');
    expect(redacted.password).toBe('[HIDDEN]');
    expect(redacted.token).toBe('[HIDDEN]');
  });

  it('redacts nested paths with tag arrays', function RedactsNestedPathsWithTagArrays() {
    const policy = Redaction.Policy('strict');
    const data = { user: { email: 'test@example.com' }, token: 'secret' };
    const tags = {
      'user.email': ['pii', 'token'],
      token: 'token',
    } as const;

    const redacted = policy.Apply(data, tags);

    expect(redacted.user.email).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(data.user.email).toBe('test@example.com');
  });
});
