/**
 * PII guardrail utilities
 * @module pii-guard
 */

import type { PiiDetector, PiiFinding, PiiGuardConfig, TagMap } from './types.js';

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phonePattern = /\+?[0-9][0-9().\-\s]{6,}[0-9]/;
const creditCardPattern = /\b(?:\d[ -]*?){13,19}\b/;

function NormalizeTags(tagValue: unknown): readonly string[] {
  if (Array.isArray(tagValue)) {
    return tagValue.filter((tag): tag is string => typeof tag === 'string');
  }
  if (typeof tagValue === 'string') {
    return [tagValue];
  }
  return [];
}

function IsTagged(tags: TagMap | undefined, payloadPath: string): boolean {
  if (!tags) return false;

  for (const [tagPath, tagValue] of Object.entries(tags)) {
    const normalizedPath = tagPath.replace(/\.\d+(\.|$)/g, '.');
    const normalizedPayloadPath = payloadPath.replace(/\.\d+(\.|$)/g, '.');
    const matchesPath =
      payloadPath === tagPath ||
      payloadPath.startsWith(`${tagPath}.`) ||
      normalizedPayloadPath === normalizedPath ||
      normalizedPayloadPath.startsWith(`${normalizedPath}.`);

    if (!matchesPath) continue;

    const tagsAtPath = NormalizeTags(tagValue);
    if (tagsAtPath.some((tag) => ['pii', 'sensitive', 'secret', 'token'].includes(tag))) {
      return true;
    }
  }

  return false;
}

function MatchesDetector(value: string, detector: PiiDetector): boolean {
  switch (detector) {
    case 'email':
      return emailPattern.test(value);
    case 'phone':
      return phonePattern.test(value);
    case 'credit-card':
      return creditCardPattern.test(value.replace(/\s+/g, ''));
  }
}

function CreatePreview(value: string): string {
  if (value.length <= 6) return '[REDACTED]';
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function VisitValue(
  value: unknown,
  payloadPath: string,
  detectors: readonly PiiDetector[],
  tags: TagMap | undefined,
  requireTags: boolean,
  findings: PiiFinding[],
): void {
  if (typeof value === 'string') {
    const tagged = IsTagged(tags, payloadPath);
    if (requireTags && tagged) return;

    for (const detector of detectors) {
      if (!MatchesDetector(value, detector)) continue;
      findings.push({
        path: payloadPath,
        detector,
        valuePreview: CreatePreview(value),
        tagged,
      });
      break;
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      VisitValue(item, `${payloadPath}.${index}`, detectors, tags, requireTags, findings);
    }
    return;
  }

  if (!value || typeof value !== 'object') return;

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    VisitValue(nestedValue, `${payloadPath}.${key}`, detectors, tags, requireTags, findings);
  }
}

/**
 * Detect potentially sensitive payload values.
 */
export function DetectPii(
  payload: unknown,
  tags: TagMap | undefined,
  config: PiiGuardConfig,
): PiiFinding[] {
  const detectors = config.detectors ?? (['email', 'phone', 'credit-card'] as const);
  const requireTags = config.requireTags ?? true;
  const findings: PiiFinding[] = [];
  VisitValue(payload, 'payload', detectors, tags, requireTags, findings);
  return findings;
}
