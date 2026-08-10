/**
 * `@dance-arena/assets` — Asset registry and manifest metadata resolution.
 *
 * Blueprint: §32–§34, §65
 *
 * Responsibility
 * - Resolves `AssetDefinition` entries from theme manifests.
 * - Owns avatar/texture cache policy metadata.
 *
 * Boundaries
 * - No hard-coded asset paths in gameplay or renderer logic — resolution happens here.
 * - No PixiJS imports; STAGE turns asset descriptors into textures.
 *
 * Task 00 status: workspace skeleton only. Implementation lands in its own task.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export const ASSETS_MODULE = {
  id: '@dance-arena/assets',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
