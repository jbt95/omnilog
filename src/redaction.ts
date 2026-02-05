/**
 * Field-level data redaction for PII and sensitive data
 * @module redaction
 */

import type { RedactionMode, FieldTag, TagMap } from './types.js';

/**
 * Redaction patterns for each mode
 */
const redactionPatterns: Record<RedactionMode, string> = {
  strict: '[REDACTED]',
  lenient: '[FILTERED]',
  dev: '[HIDDEN]',
};

/**
 * Determine if a field should be redacted based on tags and mode
 */
function ShouldRedact(
  tags: FieldTag[],
  policyTags: readonly FieldTag[] | undefined,
  mode: RedactionMode,
): boolean {
  if (!policyTags || policyTags.length === 0) {
    return false;
  }

  if (mode === 'dev') {
    return tags.some((tag) => ['secret', 'token'].includes(tag));
  }

  if (mode === 'lenient') {
    return tags.some((tag) => ['secret', 'token', 'sensitive'].includes(tag));
  }

  return tags.some((tag) => policyTags.includes(tag));
}

/**
 * Convert tag value to array of tags
 */
function GetTagList(value: FieldTag | readonly FieldTag[]): FieldTag[] {
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value as FieldTag];
}

/**
 * Set a value at a nested path in an object
 */
function SetPathValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  let current: Record<string, unknown> = target;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!key || !(key in current)) {
      return;
    }
    const next = current[key];
    if (!next || typeof next !== 'object') {
      return;
    }
    current = next as Record<string, unknown>;
  }

  const lastKey = path[path.length - 1];
  if (lastKey && lastKey in current) {
    current[lastKey] = value;
  }
}

/**
 * Apply redaction to data based on tags
 *
 * @param data - Data to redact
 * @param tags - Field tags mapping
 * @param mode - Redaction mode
 * @param policyTags - Tags to redact (defaults based on mode)
 * @returns Redacted data (new object, original unchanged)
 *
 * @example
 * ```typescript
 * const data = { email: 'user@example.com', password: 'secret' };
 * const tags = { email: 'pii', password: 'secret' };
 *
 * const redacted = ApplyRedaction(data, tags, 'strict');
 * // { email: '[REDACTED]', password: '[REDACTED]' }
 *
 * const lenient = ApplyRedaction(data, tags, 'lenient');
 * // { email: 'user@example.com', password: '[FILTERED]' }
 * ```
 */
export function ApplyRedaction<T extends Record<string, unknown>>(
  data: T,
  tags: TagMap | undefined,
  mode: RedactionMode,
  policyTags?: readonly FieldTag[],
): T {
  if (!tags) {
    return data;
  }

  const result = JSON.parse(JSON.stringify(data)) as T;

  for (const [path, tagValue] of Object.entries(tags)) {
    const tagList = GetTagList(tagValue as FieldTag | readonly FieldTag[]);

    if (!ShouldRedact(tagList, policyTags, mode)) {
      continue;
    }

    const keys = path.split('.');
    SetPathValue(result, keys, redactionPatterns[mode]);
  }

  return result;
}

/**
 * Create a redaction policy for reuse
 *
 * @param mode - Redaction mode
 * @param customTags - Custom tags to redact (optional)
 * @returns Redaction policy with apply method
 *
 * @example
 * ```typescript
 * const policy = CreateRedactionPolicy('strict');
 * const redacted = policy.Apply(data, tags);
 * ```
 */
export function CreateRedactionPolicy(mode: RedactionMode, customTags?: readonly FieldTag[]) {
  const defaultTags: Record<RedactionMode, FieldTag[]> = {
    strict: ['pii', 'secret', 'token', 'sensitive'],
    lenient: ['secret', 'token'],
    dev: ['secret', 'token'],
  };

  function Apply<T extends Record<string, unknown>>(data: T, tags: TagMap | undefined): T {
    return ApplyRedaction(data, tags, mode, customTags ?? defaultTags[mode]);
  }

  return {
    mode,
    tags: customTags ?? defaultTags[mode],
    Apply,
  };
}
