/**
 * `@dance-arena/assets` — asset registry, theme binding and avatar cache.
 *
 * Blueprint: §32–§34, §65
 *
 * Responsibility
 * - Validates and serves the APPROVED production manifest (`.dance/ASSET_MANIFEST.json` + package).
 * - Binds theme SLOTS to approved asset IDs and reports anything unresolved.
 * - Owns avatar cache policy (memory + disk ports, TTL, fallback).
 *
 * Boundaries
 * - No hard-coded asset paths outside the manifest; gameplay and renderers ask by asset ID.
 * - No PixiJS: this package produces descriptors, STAGE turns them into textures.
 * - Never modifies, recolours or substitutes approved artwork (locked visual rules 2–3).
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

/**
 * The visual revision this build consumes, pinned by `.dance/DANCE_LOCK.json`.
 *
 * Single source of truth for the pack location: bootstrap code needs a path to FIND the manifest,
 * and every path after that comes from `manifest.productionRoot`. Moving to R3 means changing this
 * constant and the theme's `visualRevision`, nothing else.
 */
export const LOCKED_VISUAL_REVISION = 'DA-VISUAL-R3';

export function productionRootFor(revision: string = LOCKED_VISUAL_REVISION): string {
  return `assets/production/${revision}`;
}

export function productionManifestPathFor(revision: string = LOCKED_VISUAL_REVISION): string {
  return `${productionRootFor(revision)}/ASSET_MANIFEST.json`;
}

export {
  parseAtlasMeta,
  parseProductionManifest,
  AtlasMetaSchema,
  ProductionManifestSchema,
  type AtlasFrame,
  type AtlasMeta,
  type AtlasSummary,
  type ParseResult,
  type ProductionAsset,
  type ProductionManifest,
} from './manifest/schema.js';

export {
  atlasNameFromPath,
  createAssetRegistry,
  type AssetLookup,
  type AssetRegistry,
  type AssetRegistryOptions,
  type ResolvedAsset,
} from './registry/assetRegistry.js';

export {
  RankLayoutSchema,
  ThemeDefinitionSchema,
  type GiftTierTheme,
  type RankLayout,
  type RankTierTheme,
  type ThemeDefinition,
} from './theme/themeSchema.js';
export { NEON_KAWAII_ARENA_THEME } from './theme/neonKawaiiArena.js';
export {
  bubbleFor,
  costumeFor,
  giftTierFor,
  hostEffectFor,
  rankTierFor,
  reactionFor,
  resolveTheme,
  type ResolvedGiftTier,
  type ResolvedRankTier,
  type ResolvedTheme,
} from './theme/resolveTheme.js';

export {
  createAvatarCache,
  createMemoryBlobStore,
  hashUrl,
  type AvatarBlob,
  type AvatarBlobStore,
  type AvatarCache,
  type AvatarCacheOptions,
  type AvatarCacheStats,
  type CachedAvatar,
} from './avatar/avatarCache.js';

export const ASSETS_MODULE = {
  id: '@dance-arena/assets',
  layer: 'platform',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
