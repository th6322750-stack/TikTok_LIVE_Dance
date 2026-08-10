/**
 * `@dance-arena/licensing` — Machine identity, signature verification, trial and entitlement resolution.
 *
 * Blueprint: §46–§48
 *
 * Responsibility
 * - Resolves `LicenseState` and entitlements.
 * - Runs a license watcher whose lifecycle is independent of the LIVE connection.
 *
 * Boundaries
 * - License lifecycle must never be tied to connector connect/disconnect.
 * - No secrets in logs or diagnostics bundles.
 *
 * Task 00 status: workspace skeleton only. Implementation lands in its own task.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export const LICENSING_MODULE = {
  id: '@dance-arena/licensing',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
