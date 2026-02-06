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
  RegistryCompatibilityIssue,
  RegistryCompatibilityReport,
  Registry,
  RegistryBuilder,
  RegistryEventOptions,
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

function CreateRegistryBuilder<ContextSchema extends z.ZodObject<z.ZodRawShape>>(
  contextSchema: ContextSchema,
): RegistryBuilder<ContextSchema> {
  function DefineEventWithContext<
    Name extends string,
    Schema extends z.ZodType,
    Kind extends EventDefAny['kind'],
    Require extends readonly (keyof z.output<ContextSchema> & string)[] | undefined,
  >(
    name: Name,
    schema: Schema,
    options: RegistryEventOptions<ContextSchema, Schema, Kind, Require>,
  ): EventDef<
    Name,
    Kind,
    Schema,
    Require,
    RegistryEventOptions<ContextSchema, Schema, Kind, Require>['tags']
  > {
    return DefineEvent(
      name,
      schema,
      options as EventOptions<
        Kind,
        Require,
        RegistryEventOptions<ContextSchema, Schema, Kind, Require>['tags']
      >,
    );
  }

  return {
    DefineEvent: DefineEventWithContext,
  };
}

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
 * const registry = CreateRegistry(contextSchema, (registry) => [
 *   registry.DefineEvent(
 *     'user.login',
 *     z.object({ userId: z.string(), email: z.string().email() }),
 *     {
 *       kind: 'log',
 *       level: 'info',
 *       require: ['traceId'] as const,
 *       tags: { 'payload.email': 'pii' },
 *       description: 'User login event',
 *     },
 *   ),
 * ] as const);
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
    ...(options.deprecated !== undefined ? { deprecated: options.deprecated } : {}),
    ...(options.deprecationMessage !== undefined
      ? { deprecationMessage: options.deprecationMessage }
      : {}),
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
): Registry<ContextSchema, Events>;
export function CreateRegistry<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
>(
  contextSchema: ContextSchema,
  events: (
    registry: RegistryBuilder<ContextSchema>,
  ) => Events & EnforceRequiredKeys<Events, z.output<ContextSchema>>,
): Registry<ContextSchema, Events>;
export function CreateRegistry<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
>(
  contextSchema: ContextSchema,
  events:
    | (Events & EnforceRequiredKeys<Events, z.output<ContextSchema>>)
    | ((
        registry: RegistryBuilder<ContextSchema>,
      ) => Events & EnforceRequiredKeys<Events, z.output<ContextSchema>>),
): Registry<ContextSchema, Events> {
  const registryBuilder = CreateRegistryBuilder(contextSchema);
  const resolvedEvents = typeof events === 'function' ? events(registryBuilder) : events;
  const eventsByName = {} as EventsByName<Events>;

  for (const event of resolvedEvents) {
    if ((eventsByName as Record<string, Events[number]>)[event.name]) {
      throw new Error(`Duplicate event name: ${event.name}`);
    }

    (eventsByName as Record<string, Events[number]>)[event.name] = event;
  }

  return {
    contextSchema,
    events: resolvedEvents,
    eventsByName,
    Get: (name) => eventsByName[name],
    DefineEvent: registryBuilder.DefineEvent,
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
    ...(event.deprecated !== undefined ? { deprecated: event.deprecated } : {}),
    ...(event.deprecationMessage !== undefined
      ? { deprecationMessage: event.deprecationMessage }
      : {}),
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

/**
 * Compare an exported registry version with a current registry.
 *
 * Detects removals and breaking schema changes.
 */
export function CompareRegistry(
  previous: RegistryExport,
  current: Registry<z.ZodObject<z.ZodRawShape>, readonly EventDefAny[]>,
): RegistryCompatibilityReport {
  const issues: RegistryCompatibilityIssue[] = [];
  const previousByName = new Map(previous.events.map((event) => [event.name, event]));
  const currentByName = new Map(current.events.map((event) => [event.name, event]));

  for (const previousEvent of previous.events) {
    const currentEvent = currentByName.get(previousEvent.name);
    if (!currentEvent) {
      issues.push({
        event: previousEvent.name,
        type: 'removed',
        message: `Event "${previousEvent.name}" was removed`,
      });
      continue;
    }

    if (previousEvent.kind !== currentEvent.kind) {
      issues.push({
        event: previousEvent.name,
        type: 'kind-changed',
        message: `Event "${previousEvent.name}" changed kind from "${previousEvent.kind}" to "${currentEvent.kind}"`,
      });
    }

    if (previousEvent.fingerprint !== currentEvent.fingerprint) {
      issues.push({
        event: previousEvent.name,
        type: 'fingerprint-changed',
        message: `Event "${previousEvent.name}" changed schema fingerprint`,
      });

      const previousVersion = previousEvent.schemaVersion;
      const currentVersion = currentEvent.version;
      if (!previousVersion || !currentVersion || previousVersion === currentVersion) {
        issues.push({
          event: previousEvent.name,
          type: 'fingerprint-without-version-bump',
          message: `Event "${previousEvent.name}" changed schema without a version bump`,
        });
      }
    }
  }

  for (const currentEvent of current.events) {
    if (!previousByName.has(currentEvent.name)) {
      issues.push({
        event: currentEvent.name,
        type: 'added',
        message: `Event "${currentEvent.name}" was added`,
      });
    }
  }

  const incompatibleIssueTypes = new Set([
    'removed',
    'kind-changed',
    'fingerprint-without-version-bump',
  ]);

  return {
    compatible: !issues.some((issue) => incompatibleIssueTypes.has(issue.type)),
    issues,
  };
}
