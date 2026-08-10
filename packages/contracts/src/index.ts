/**
 * `@dance-arena/contracts` — the shared language of Dance Arena V2.
 *
 * Blueprint: §9–§12 (events), §15–§27 (state), §29–§31 (stage), §38–§42 (IPC), §43–§48
 * (settings/license).
 *
 * Responsibility
 * - Normalized event schemas and their Zod validators.
 * - Canonical game state / stage render types shared by Main, CONTROL and STAGE.
 * - Typed IPC channel names, request schemas and response types.
 *
 * Boundaries
 * - No runtime behaviour beyond validation and pure helpers.
 * - No Node built-ins, Electron, React or PixiJS — every layer depends on this package.
 * - No ranking/queue/tier RULES here; those belong to the Core Engine (thresholds are config).
 */

export * from './common.js';
export * from './connector.js';
export * from './license.js';
export * from './settings.js';

export * from './live/user.js';
export * from './live/events.js';
export * from './live/raw.js';

export * from './game/commands.js';
export * from './game/config.js';
export * from './game/state.js';
export * from './game/events.js';

export * from './stage/events.js';

export * from './ipc/channels.js';

import { CONTRACTS_SCHEMA_VERSION } from './common.js';

/** Where a workspace module sits in the dependency direction of Blueprint §67. */
export type ModuleLayer = 'contracts' | 'domain' | 'platform' | 'app';

/**
 * Self-description of a workspace module, used by diagnostics to report which modules are loaded
 * and which contract version they were built against.
 */
export interface WorkspaceModuleInfo {
  readonly id: `@dance-arena/${string}`;
  readonly layer: ModuleLayer;
  readonly contractsSchemaVersion: typeof CONTRACTS_SCHEMA_VERSION;
}

export const CONTRACTS_MODULE = {
  id: '@dance-arena/contracts',
  layer: 'contracts',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
