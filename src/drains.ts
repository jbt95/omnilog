/**
 * Public drains facade.
 *
 * This module exposes provider-native sinks and utility exports while
 * delegating provider implementations to `src/drains/*`.
 * @module drains
 */

import type {
  BetterStackDrainConfig,
  DatadogDrainConfig,
  DrainConfig,
  DrainHandle,
  LokiDrainConfig,
} from './types.js';
import { BatchedDrain } from './drains/batched-drain.js';
import { CreateDrainSink, CreateDrainSinkFactory } from './drains/drain-factory.js';
import { CreateAxiomDrain } from './drains/provider-axiom.js';
import { CreateOTLPDrain } from './drains/provider-otlp.js';
import { CreateWebhookDrain, type WebhookDrainConfig } from './drains/provider-webhook.js';
import { CreateDatadogDrain } from './drains/provider-datadog.js';
import { CreateLokiDrain } from './drains/provider-loki.js';
import { CreateBetterStackDrain } from './drains/provider-better-stack.js';
import {
  CreateDeadLetterFileSink,
  CreateFileSource,
  FileSource,
  type FileSourceOptions,
} from './drains/dead-letter-file.js';
import { CreateFingerprint } from './drains/fingerprint.js';

const createAxiomSink = CreateDrainSinkFactory(CreateAxiomDrain);
const createOtlpSink = CreateDrainSinkFactory(CreateOTLPDrain);
const createWebhookSink = CreateDrainSinkFactory(CreateWebhookDrain);
const createDatadogSink = CreateDrainSinkFactory(CreateDatadogDrain);
const createLokiSink = CreateDrainSinkFactory(CreateLokiDrain);
const createBetterStackSink = CreateDrainSinkFactory(CreateBetterStackDrain);

/**
 * Create a batched Axiom sink with flush handle.
 * Shared reliability options: `batchSize`, `flushInterval`, `retry`, `queue`, `telemetry`, `deadLetterSink`.
 */
export function CreateAxiomSink<Context = unknown, Payload = unknown>(
  config: DrainConfig,
): DrainHandle<Context, Payload> {
  return createAxiomSink<Context, Payload>(config);
}

/**
 * Create a batched OTLP sink with flush handle.
 * Shared reliability options: `batchSize`, `flushInterval`, `retry`, `queue`, `telemetry`, `deadLetterSink`.
 */
export function CreateOTLPSink<Context = unknown, Payload = unknown>(
  config: DrainConfig,
): DrainHandle<Context, Payload> {
  return createOtlpSink<Context, Payload>(config);
}

/**
 * Create a batched webhook sink with flush handle.
 * Shared reliability options: `batchSize`, `flushInterval`, `retry`, `queue`, `telemetry`, `deadLetterSink`.
 */
export function CreateWebhookSink<Context = unknown, Payload = unknown>(
  config: WebhookDrainConfig,
): DrainHandle<Context, Payload> {
  return createWebhookSink<Context, Payload>(config);
}

/**
 * Create a batched Datadog sink with flush handle.
 * Shared reliability options: `batchSize`, `flushInterval`, `retry`, `queue`, `telemetry`, `deadLetterSink`.
 */
export function CreateDatadogSink<Context = unknown, Payload = unknown>(
  config: DatadogDrainConfig,
): DrainHandle<Context, Payload> {
  return createDatadogSink<Context, Payload>(config);
}

/**
 * Create a batched Loki sink with flush handle.
 * Shared reliability options: `batchSize`, `flushInterval`, `retry`, `queue`, `telemetry`, `deadLetterSink`.
 */
export function CreateLokiSink<Context = unknown, Payload = unknown>(
  config: LokiDrainConfig,
): DrainHandle<Context, Payload> {
  return createLokiSink<Context, Payload>(config);
}

/**
 * Create a batched Better Stack sink with flush handle.
 * Shared reliability options: `batchSize`, `flushInterval`, `retry`, `queue`, `telemetry`, `deadLetterSink`.
 */
export function CreateBetterStackSink<Context = unknown, Payload = unknown>(
  config: BetterStackDrainConfig,
): DrainHandle<Context, Payload> {
  return createBetterStackSink<Context, Payload>(config);
}

export {
  BatchedDrain,
  CreateDrainSink,
  CreateDrainSinkFactory,
  CreateAxiomDrain,
  CreateOTLPDrain,
  CreateWebhookDrain,
  CreateDatadogDrain,
  CreateLokiDrain,
  CreateBetterStackDrain,
  CreateDeadLetterFileSink,
  CreateFileSource,
  CreateFingerprint,
  FileSource,
};

export type { FileSourceOptions, WebhookDrainConfig };
