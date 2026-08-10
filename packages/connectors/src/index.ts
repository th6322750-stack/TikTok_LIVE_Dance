/**
 * `@dance-arena/connectors` — LiveConnector implementations and the provider normalizers.
 *
 * Blueprint: §6–§8, §9, §53–§54
 *
 * Responsibility
 * - Implements `LiveConnector`: connect, disconnect, status state machine, reconnect/backoff.
 * - Parses provider transport messages and emits raw live events.
 * - Normalizes raw provider payloads into contract v1 events at a single boundary.
 *
 * Boundaries
 * - No ranking, VIP, queue, party goal, dancer or any other gameplay logic.
 * - No direct writes to game state — raw events go to the normalizer, then to the engine.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export { Emitter } from './support/emitter.js';
export {
  createRealScheduler,
  ManualScheduler,
  type CancelScheduled,
  type Scheduler,
} from './support/scheduler.js';

export { MockConnector, type MockConnectorOptions } from './mock/mockConnector.js';
export {
  ReplayConnector,
  RecordedSessionSchema,
  RecordedStepSchema,
  REPLAY_SPEEDS,
  type RecordedSession,
  type RecordedStep,
  type ReplayConnectorOptions,
  type ReplaySpeed,
} from './replay/replayConnector.js';

export {
  EulerStreamConnector,
  DEFAULT_EULERSTREAM_ENDPOINT,
  type EulerStreamConnectorOptions,
} from './eulerstream/eulerStreamConnector.js';
export {
  baseBackoffDelay,
  computeBackoffDelay,
  type BackoffOptions,
} from './eulerstream/backoff.js';
export {
  createWebSocketTransport,
  redactUrl,
  type Transport,
  type TransportConnection,
  type TransportHandlers,
} from './eulerstream/transport.js';

export { EulerStreamNormalizer } from './normalizer/eulerstream.js';
export { MockNormalizer, MockPayloadSchema, type MockPayload } from './normalizer/mock.js';
export {
  ignored,
  invalid,
  type EventNormalizer,
  type NormalizeResult,
} from './normalizer/types.js';
export { createNormalizerRegistry, type NormalizerRegistry } from './normalizer/registry.js';

export const CONNECTORS_MODULE = {
  id: '@dance-arena/connectors',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
