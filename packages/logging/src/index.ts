/**
 * `@dance-arena/logging` — Structured logging, levels, redaction and log sinks for diagnostics.
 *
 * Blueprint: §55–§56
 *
 * Responsibility
 * - Level-based structured logging (DEBUG/INFO/WARN/ERROR) with pluggable sinks.
 * - Redacts sensitive fields before anything is written or exported.
 *
 * Boundaries
 * - No unbounded raw-event logging.
 * - No secrets written in clear text.
 *
 * Task 00 status: workspace skeleton only. Implementation lands in its own task.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export const LOGGING_MODULE = {
  id: '@dance-arena/logging',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
