/**
 * `@dance-arena/contracts` — Shared contracts: normalized event schemas, game state types and typed IPC channel definitions.
 *
 * Blueprint: §9–§12, §30, §38–§41
 *
 * Responsibility
 * - Normalized event schemas (`GiftEvent`, `CommentEvent`, …) and their Zod validators.
 * - Game state / stage event types shared by Main, CONTROL and STAGE.
 * - Typed IPC channel names and payload types.
 *
 * Boundaries
 * - No runtime behaviour beyond validation helpers.
 * - No Node built-ins, Electron, React or PixiJS — every layer depends on this package.
 *
 * Task 00 status: workspace skeleton only. Task 01 adds the real contracts and Zod schemas.
 */

/** Version of the internal Dance Arena event/state contracts (Blueprint §9). */
export const CONTRACTS_SCHEMA_VERSION = 1 as const;

/** Where a workspace module sits in the dependency direction of Blueprint §67. */
export type ModuleLayer = 'contracts' | 'domain' | 'platform' | 'app';

/**
 * Self-description of a workspace module.
 *
 * Exists so every package has a typed public entry point from day one and so diagnostics can
 * report which modules are loaded and which contract version they were built against.
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
