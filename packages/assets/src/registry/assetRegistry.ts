/**
 * AssetRegistry (Blueprint §32–§33).
 *
 * The one place that answers "where is asset X and how do I draw it". Gameplay and renderers ask by
 * ASSET ID; nothing outside this module may hard-code a path or an atlas coordinate (locked manifest
 * rule 2).
 *
 * Resolution for a lookup:
 *   1. runtime atlas frame (preferred — WebP atlas, rule 5)
 *   2. individual WebP file (source/fallback package), always populated
 *   3. the CALLER-DECLARED category fallback, because only the caller knows which slot it is filling
 *   4. `undefined`, recorded in `missing`, so the caller degrades instead of crashing
 */

import type { AssetCategory, AssetId, HeadSocket, Pivot } from '@dance-arena/contracts';

import {
  isAtlasRuntimeRef,
  isStandaloneRuntimeRef,
  type AtlasFrame,
  type AtlasMeta,
  type ProductionAsset,
  type ProductionManifest,
} from '../manifest/schema.js';

export interface ResolvedAsset {
  readonly id: AssetId;
  readonly category: AssetCategory;
  readonly width: number;
  readonly height: number;
  readonly pivot: Pivot;
  /** Normalized avatar socket, when this asset is a dancer body. */
  readonly headSocket?: HeadSocket;
  /** Atlas-backed source, when the asset ships in a runtime atlas. */
  readonly atlas?: {
    readonly name: string;
    readonly file: string;
    readonly frame: string;
    readonly rect: AtlasFrame;
  };
  /** Standalone WebP path, always available as a fallback. */
  readonly file: string;
  /** True when this is not the asset that was asked for. */
  readonly isFallback: boolean;
}

export interface AssetLookup {
  readonly id: AssetId;
  /** Category whose fallback applies when `id` is unavailable. */
  readonly category?: AssetCategory;
}

export interface AssetRegistryOptions {
  readonly manifest: ProductionManifest;
  /** Atlas metadata keyed by atlas name (`dancers-regular`, `stage-ui`, …). */
  readonly atlases?: Readonly<Record<string, AtlasMeta>>;
  /** Per-category fallback ids used when a requested asset is unavailable. */
  readonly fallbacks?: Partial<Record<AssetCategory, AssetId>>;
}

export interface AssetRegistry {
  readonly visualRevision: string;
  readonly assetCount: number;
  has(id: AssetId): boolean;
  /** Exact lookup; no substitution. */
  get(id: AssetId): ResolvedAsset | undefined;
  /** Lookup with the caller's category fallback applied. */
  resolve(lookup: AssetLookup): ResolvedAsset | undefined;
  byCategory(category: AssetCategory): ResolvedAsset[];
  idsByCategory(category: AssetCategory): AssetId[];
  /** Atlas names that must be loaded for the given asset ids — used for lazy loading. */
  atlasesFor(ids: readonly AssetId[]): string[];
  atlasNames(): string[];
  atlasFile(name: string): string | undefined;
  /** Ids requested but absent from the manifest, accumulated across lookups. */
  readonly missing: readonly AssetId[];
}

/** `assets/production/DA-VISUAL-R1/runtime/dancers-regular.webp` → `dancers-regular`. */
export function atlasNameFromPath(path: string): string {
  const file = path.split('/').at(-1) ?? path;
  return file.replace(/\.(webp|png)$/i, '');
}

export function createAssetRegistry(options: AssetRegistryOptions): AssetRegistry {
  const { manifest } = options;
  const atlases = options.atlases ?? {};
  const fallbacks = options.fallbacks ?? {};

  const byId = new Map<AssetId, ProductionAsset>(manifest.assets.map((asset) => [asset.id, asset]));
  const missing = new Set<AssetId>();

  const joinRoot = (relative: string): string =>
    relative.startsWith(manifest.productionRoot)
      ? relative
      : `${manifest.productionRoot}/${relative}`;

  function resolveFrame(asset: ProductionAsset): ResolvedAsset['atlas'] {
    if (!isAtlasRuntimeRef(asset.runtime)) return undefined;

    const name = atlasNameFromPath(asset.runtime.atlas);
    const meta = atlases[name];
    const rect = meta?.frames[asset.runtime.frame];

    if (meta === undefined || rect === undefined) return undefined;

    return { name, file: asset.runtime.atlas, frame: asset.runtime.frame, rect };
  }

  function toResolved(asset: ProductionAsset, isFallback: boolean): ResolvedAsset {
    const atlas = resolveFrame(asset);
    const socket = asset.headSocket?.normalized;

    // An asset too large to pack (the stage background) ships as a standalone runtime file; prefer
    // that over the individual source copy.
    const file = isStandaloneRuntimeRef(asset.runtime) ? asset.runtime.file : joinRoot(asset.webp);

    return {
      id: asset.id,
      category: asset.category,
      width: asset.width,
      height: asset.height,
      pivot: asset.pivot ?? { x: 0.5, y: 1 },
      ...(socket === undefined
        ? {}
        : { headSocket: { x: socket[0], y: socket[1], radius: socket[2] } }),
      ...(atlas === undefined ? {} : { atlas }),
      file,
      isFallback,
    };
  }

  function get(id: AssetId): ResolvedAsset | undefined {
    const asset = byId.get(id);
    return asset === undefined ? undefined : toResolved(asset, false);
  }

  return {
    visualRevision: manifest.visualRevision,
    assetCount: manifest.assets.length,
    has: (id) => byId.has(id),
    get,

    resolve({ id, category }) {
      const exact = get(id);
      if (exact !== undefined) return exact;

      missing.add(id);

      if (category === undefined) return undefined;

      const fallbackId = fallbacks[category];
      if (fallbackId === undefined) return undefined;

      const fallback = byId.get(fallbackId);
      return fallback === undefined ? undefined : toResolved(fallback, true);
    },

    byCategory(category) {
      return manifest.assets
        .filter((asset) => asset.category === category)
        .map((asset) => toResolved(asset, false));
    },

    idsByCategory(category) {
      return manifest.assets
        .filter((asset) => asset.category === category)
        .map((asset) => asset.id);
    },

    atlasesFor(ids) {
      const names = new Set<string>();

      for (const id of ids) {
        const runtime = byId.get(id)?.runtime;
        if (!isAtlasRuntimeRef(runtime)) continue;

        names.add(atlasNameFromPath(runtime.atlas));
      }

      return [...names];
    },

    atlasNames: () => Object.keys(manifest.atlas),

    atlasFile(name) {
      const summary = manifest.atlas[name];
      if (summary === undefined) return undefined;

      return `${manifest.runtimeRoot}/${summary.atlas}`;
    },

    get missing(): readonly AssetId[] {
      return [...missing];
    },
  };
}
