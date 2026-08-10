/**
 * `@dance-arena/simulator` — synthetic and replay event sources.
 *
 * Blueprint: §53–§54
 *
 * Responsibility
 * - Generates synthetic live events and turns scenarios into replayable sessions.
 * - Always feeds MockConnector → Normalizer → Core Engine — never STAGE directly.
 *
 * Boundaries
 * - Never bypasses the normalizer or the Core Engine to fake stage output.
 * - No gameplay rules of its own.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export { createSimulator, type Simulator, type SimulatorOptions } from './simulator.js';
export { SCENARIOS, findScenario, type Scenario, type ScenarioStep } from './scenarios.js';
export { SessionRecorder, scenarioToSession, type SessionRecorderOptions } from './recorder.js';
export {
  GIFT_PRESETS,
  commentPayload,
  followPayload,
  giftPayload,
  giftPreset,
  giftStreakPayloads,
  joinPayload,
  likePayload,
  sharePayload,
  type GiftPayloadOptions,
  type GiftPresetId,
} from './payloads.js';
export { simulatedAudience, simulatedUser, type SimulatedUser } from './users.js';

export const SIMULATOR_MODULE = {
  id: '@dance-arena/simulator',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
