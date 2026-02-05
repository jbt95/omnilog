import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CreateRegistry, ExportRegistry } from '../src/index.js';

describe('Registry', function RegistrySuite() {
  it('rejects duplicate event names', function RejectsDuplicateEventNames() {
    const contextSchema = z.object({ traceId: z.string() });
    expect(() =>
      CreateRegistry(contextSchema, (registry) => [
        registry.DefineEvent('duplicate.event', z.object({ id: z.string() }), { kind: 'log' }),
        registry.DefineEvent('duplicate.event', z.object({ id: z.string() }), { kind: 'log' }),
      ] as const),
    ).toThrow('Duplicate event name');
  });

  it('exports registry with JSON schemas', function ExportsRegistryWithJsonSchemas() {
    const contextSchema = z.object({ traceId: z.string() });
    const registry = CreateRegistry(contextSchema, (registry) => [
      registry.DefineEvent(
        'checkout.started',
        z.object({
          cartId: z.string(),
          customerEmail: z.string().email(),
          items: z.number().int().positive(),
        }),
        {
          kind: 'log',
          version: '1.0.0',
          level: 'info',
          require: ['traceId'] as const,
          tags: {
            'payload.customerEmail': 'pii',
          },
          description: 'Checkout process started',
        },
      ),
    ] as const);
    const exported = ExportRegistry(registry, '2.0.0');

    expect(exported.version).toBe('2.0.0');
    expect(exported.events).toHaveLength(1);

    const eventExport = exported.events[0];
    expect(eventExport).toBeDefined();
    expect(eventExport!.name).toBe('checkout.started');
    expect(eventExport!.kind).toBe('log');
    expect(eventExport!.schemaVersion).toBe('1.0.0');
    expect(eventExport!.level).toBe('info');
    expect(eventExport!.require).toEqual(['traceId']);
    expect(eventExport!.description).toBe('Checkout process started');
    expect(eventExport!.jsonSchema).toBeDefined();
    expect(eventExport!.fingerprint).toBeDefined();
  });
});
