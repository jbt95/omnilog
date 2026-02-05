/**
 * Event registry for defining and managing events
 * @module registry
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SchemaFingerprint } from './fingerprint.js';
import type {
  EventDef,
  EventDefAny,
  EventDefExport,
  EventOptions,
  EventsByName,
  Registry,
  RegistryExport,
} from './types.js';

/**
 * Extract required context keys from events
 */
type RequireKeys<Events extends readonly EventDefAny[]> = Events[number] extends {
  require?: readonly (infer K)[];
}
  ? K
  : never;

/**
 * Enforce that all required context keys are present in the context schema
 */
type EnforceRequiredKeys<Events extends readonly EventDefAny[], Context> =
  Exclude<RequireKeys<Events>, keyof Context> extends never ? Events : never;

/**
 * Define an event with schema and metadata
 *
 * @param name - Unique event name
 * @param schema - Zod schema for payload validation
 * @param options - Event options (kind, level, require, tags, description)
 * @returns Event definition
 *
 * @example
 * ```typescript
 * const userLogin = DefineEvent(
 *   'user.login',
 *   z.object({ userId: z.string(), email: z.string().email() }),
 *   {
 *     kind: 'log',
 *     level: 'info',
 *     require: ['traceId'] as const,
 *     tags: { 'payload.email': 'pii' },
 *     description: 'User login event',
 *   }
 * );
 * ```
 */
export function DefineEvent<
  Name extends string,
  Schema extends z.ZodType,
  Kind extends EventDefAny['kind'],
  Require extends readonly string[] | undefined,
  Tags extends EventDefAny['tags'],
>(
  name: Name,
  schema: Schema,
  options: EventOptions<Kind, Require, Tags>,
): EventDef<Name, Kind, Schema, Require, Tags> {
  const base = {
    name,
    kind: options.kind,
    schema,
    fingerprint: SchemaFingerprint(schema),
  };

  return {
    ...base,
    ...(options.version !== undefined ? { version: options.version } : {}),
    ...(options.level !== undefined ? { level: options.level } : {}),
    ...(options.require !== undefined ? { require: options.require } : {}),
    ...(options.tags !== undefined ? { tags: options.tags } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
  };
}

/**
 * Create an event registry
 *
 * @param contextSchema - Zod schema for context validation
 * @param events - Array of event definitions
 * @returns Registry with events indexed by name
 *
 * @example
 * ```typescript
 * const registry = CreateRegistry(contextSchema, [
 *   userLogin,
 *   orderCreated,
 * ] as const);
 *
 * // Access events by name
 * const loginEvent = registry.Get('user.login');
 * ```
 */
export function CreateRegistry<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
>(
  contextSchema: ContextSchema,
  events: Events & EnforceRequiredKeys<Events, z.output<ContextSchema>>,
): Registry<ContextSchema, Events> {
  const eventsByName = {} as EventsByName<Events>;

  for (const event of events) {
    if ((eventsByName as Record<string, Events[number]>)[event.name]) {
      throw new Error(`Duplicate event name: ${event.name}`);
    }

    (eventsByName as Record<string, Events[number]>)[event.name] = event;
  }

  return {
    contextSchema,
    events,
    eventsByName,
    Get: (name) => eventsByName[name],
  };
}

/**
 * Export a single event definition
 */
function ExportEvent(event: EventDefAny): EventDefExport {
  const jsonSchema = zodToJsonSchema(event.schema, {
    target: 'jsonSchema7',
  });

  const base = {
    name: event.name,
    kind: event.kind,
    fingerprint: event.fingerprint,
    jsonSchema,
  };

  return {
    ...base,
    ...(event.version !== undefined ? { schemaVersion: event.version } : {}),
    ...(event.level !== undefined ? { level: event.level } : {}),
    ...(event.require !== undefined ? { require: event.require } : {}),
    ...(event.tags !== undefined ? { tags: event.tags } : {}),
    ...(event.description !== undefined ? { description: event.description } : {}),
  };
}

/**
 * Export registry to JSON format
 *
 * @param registry - Event registry to export
 * @param version - Registry version
 * @returns Exported registry with JSON schemas
 *
 * @example
 * ```typescript
 * const exported = ExportRegistry(registry, '1.0.0');
 * fs.writeFileSync('registry.json', JSON.stringify(exported, null, 2));
 * ```
 */
export function ExportRegistry(
  registry: Registry<z.ZodObject<z.ZodRawShape>, readonly EventDefAny[]>,
  version = '1.0.0',
): RegistryExport {
  return {
    version,
    events: registry.events.map(ExportEvent),
  };
}
