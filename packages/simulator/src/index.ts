/**
 * `@dance-arena/simulator` — Synthetic and replay event sources that drive the real pipeline through MockConnector.
 *
 * Blueprint: §53–§54
 *
 * Responsibility
 * - Generates synthetic live events and replays recorded sessions.
 * - Always feeds MockConnector → Normalizer → Core Engine — never STAGE directly.
 *
 * Boundaries
 * - Never bypasses the normalizer or the Core Engine to fake stage output.
 * - No gameplay rules of its own.
 *
 * Task 00 status: workspace skeleton only. Implementation lands in its own task.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export const SIMULATOR_MODULE = {
  id: '@dance-arena/simulator',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
