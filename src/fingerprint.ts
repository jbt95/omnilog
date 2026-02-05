/**
 * Schema fingerprinting for versioning and change detection
 * @module fingerprint
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * JSON-compatible value type
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Stable JSON stringification that produces consistent output
 * regardless of key ordering
 */
function StableStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => StableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${StableStringify(value[key] as JsonValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

/**
 * Sanitize a value for fingerprinting by removing non-deterministic parts
 */
function Sanitize(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => Sanitize(item));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const output: Record<string, JsonValue> = {};

    for (const [key, entry] of Object.entries(record)) {
      if (key === '~standard') {
        continue;
      }

      if (entry === undefined || typeof entry === 'function') {
        continue;
      }

      output[key] = Sanitize(entry);
    }

    return output;
  }

  return String(value);
}

/**
 * Generate a fingerprint for a Zod schema
 * 
 * The fingerprint is a hash of the schema's JSON Schema representation,
 * used for versioning and detecting schema changes.
 * 
 * @param schema - Zod schema to fingerprint
 * @returns 12-character hexadecimal fingerprint
 * 
 * @example
 * ```typescript
 * const schema = z.object({ id: z.string(), count: z.number() });
 * const fingerprint = SchemaFingerprint(schema);
 * // '1949fe849d38'
 * ```
 */
export function SchemaFingerprint(schema: z.ZodType): string {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
  });
  const cleaned = Sanitize(jsonSchema);
  const body = StableStringify(cleaned);
  return createHash('sha256').update(body).digest('hex').slice(0, 12);
}
