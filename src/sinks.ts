/**
 * Sink implementations for different output formats
 * @module sinks
 */

import { stdout } from 'node:process';
import type { Envelope, LogLevel, MemorySink, Sink } from './types.js';

/**
 * ANSI color codes for log levels
 */
const levelColors: Record<LogLevel, string> = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
};

const reset = '\x1b[0m';
const dim = '\x1b[2m';
const bold = '\x1b[1m';

/**
 * Format ISO timestamp to readable time
 */
function FormatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format a value for display
 */
function FormatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.length}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries.map(([k, v]) => `${k}=${FormatValue(v)}`).join(' ');
  }
  return String(value);
}

/**
 * Render object as tree structure
 */
function RenderTree(obj: Record<string, unknown>, prefix = '', isLast = true): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '';

  let output = '';
  entries.forEach(([key, value], index) => {
    const isLastItem = index === entries.length - 1;
    const connector = isLastItem ? '└─' : '├─';
    const nextPrefix = isLast ? '  ' : '│ ';

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      output += `${prefix}${connector} ${key}:\n`;
      output += RenderTree(value as Record<string, unknown>, prefix + nextPrefix, isLastItem);
    } else {
      output += `${prefix}${connector} ${key}: ${dim}${FormatValue(value)}${reset}\n`;
    }
  });

  return output;
}

/**
 * Create a visual sink for development output
 *
 * Outputs events in a tree format with colors:
 * ```
 * 14:32:15 INFO user.login
 *   ├─ userId: 123
 *   └─ email: [REDACTED]
 * ```
 *
 * @returns Sink for visual output
 */
export function CreateVisualSink<Context = unknown, Payload = unknown>(): Sink<
  Envelope<Context, Payload>
> {
  return (event) => {
    const envelope = event as Envelope<Record<string, unknown>, Record<string, unknown>>;
    const level = envelope.level ?? 'info';
    const color = levelColors[level];
    const timestamp = FormatTimestamp(envelope.ts);

    let output = '';

    output += `${dim}${timestamp}${reset} ${color}${bold}${level.toUpperCase()}${reset} ${envelope.name}\n`;

    if (Object.keys(envelope.context).length > 0) {
      output += RenderTree(envelope.context, '', true);
    }

    if (Object.keys(envelope.payload).length > 0) {
      const payloadEntries = Object.entries(envelope.payload);
      if (payloadEntries.length > 0) {
        output += '  ' + payloadEntries.map(([k, v]) => `${k}=${FormatValue(v)}`).join(' ') + '\n';
      }
    }

    stdout.write(output);
  };
}

/**
 * Create a structured sink for JSON output
 *
 * Outputs events as JSON lines (NDJSON format), suitable for production:
 * ```
 * {"kind":"log","name":"user.login","ts":"2024-01-15T14:32:15.123Z",...}
 * ```
 *
 * @returns Sink for JSON output
 */
export function CreateStructuredSink<Context = unknown, Payload = unknown>(): Sink<
  Envelope<Context, Payload>
> {
  return (event) => {
    stdout.write(`${JSON.stringify(event)}\n`);
  };
}

/**
 * Create a memory sink for testing
 *
 * Captures events in memory for assertions:
 * ```typescript
 * const memory = CreateMemorySink();
 * const loggerFactory = TypedLogger.For(registry, { sinks: [memory] });
 * const logger = loggerFactory.Singleton();
 *
 * logger.Emit('user.login', { userId: '123' });
 *
 * expect(memory.events[0].payload.userId).toBe('123');
 * ```
 *
 * @returns Sink function with captured events
 */
export function CreateMemorySink<Context = unknown, Payload = unknown>(): MemorySink<
  Context,
  Payload
> {
  const events: Envelope<Context, Payload>[] = [];

  const sink = ((event: unknown) => {
    events.push(event as Envelope<Context, Payload>);
  }) as MemorySink<Context, Payload>;

  sink.events = events;

  return sink;
}

/**
 * Create an environment-aware sink
 *
 * Uses visual sink in development, structured sink in production:
 * - Development: `NODE_ENV !== 'production'` → visual output
 * - Production: `NODE_ENV === 'production'` → JSON output
 *
 * @param options - Options with development override
 * @returns Environment-appropriate sink
 */
export function CreateEnvironmentSink<Context = unknown, Payload = unknown>(
  options: { development?: boolean } = {},
): Sink<Envelope<Context, Payload>> {
  const isDev = options.development ?? process.env.NODE_ENV !== 'production';
  return isDev ? CreateVisualSink() : CreateStructuredSink();
}
