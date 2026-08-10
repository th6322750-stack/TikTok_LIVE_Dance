/**
 * `@dance-arena/settings` — Settings load/validate/migrate/export with a versioned config schema.
 *
 * Blueprint: §43–§45
 *
 * Responsibility
 * - Loads, validates and migrates the versioned settings document (`configVersion`).
 * - Keeps secrets out of the exportable settings document.
 *
 * Boundaries
 * - No gameplay logic.
 * - No plaintext secrets in exported/diagnostic output.
 *
 * Task 00 status: workspace skeleton only. Implementation lands in its own task.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export const SETTINGS_MODULE = {
  id: '@dance-arena/settings',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
