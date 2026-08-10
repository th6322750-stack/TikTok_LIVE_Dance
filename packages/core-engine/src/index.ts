/**
 * `@dance-arena/core-engine` — Canonical game state and gameplay rules. Pure TypeScript domain layer.
 *
 * Blueprint: §14–§27
 *
 * Responsibility
 * - Owns the canonical `GameState` (session, users, queue, dancers, ranking, VIP, party goal).
 * - Applies normalized events and validated commands; emits control/stage events.
 * - Deterministic and unit-testable in isolation.
 *
 * Boundaries
 * - No Electron, React or PixiJS imports.
 * - No I/O, no Node built-ins, no timers hidden inside domain logic — time is passed in.
 * - Never accepts raw provider payloads; only normalized contracts.
 *
 * Task 00 status: workspace skeleton only. Implementation lands in its own task.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export const CORE_ENGINE_MODULE = {
  id: '@dance-arena/core-engine',
  layer: 'domain',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
