/**
 * `@dance-arena/connectors` — LiveConnector implementations (EulerStream, Mock, Replay) and their transport handling.
 *
 * Blueprint: §6–§8
 *
 * Responsibility
 * - Implements `LiveConnector`: connect, disconnect, status state machine, reconnect/backoff.
 * - Parses provider transport messages and emits raw live events.
 *
 * Boundaries
 * - No ranking, VIP, queue, party goal, dancer or any other gameplay logic.
 * - No direct writes to game state — raw events go to the normalizer.
 *
 * Task 00 status: workspace skeleton only. Implementation lands in its own task.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export const CONNECTORS_MODULE = {
  id: '@dance-arena/connectors',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
