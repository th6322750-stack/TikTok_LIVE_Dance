/**
 * Texture loading for approved assets (Blueprint §33–§34, §65).
 *
 * Atlases are loaded ONCE and every frame is cut from them with `new Texture({source, frame})`, so
 * 104 assets cost a handful of GPU textures instead of one per sprite. Frame rectangles come from
 * the atlas metadata — never from coordinates written in code (locked rule 2).
 *
 * Lazy by design: only the atlases a theme actually references get loaded (Blueprint §65).
 */

import type { ResolvedAsset } from '@dance-arena/assets';
import { Assets, Rectangle, Texture } from 'pixi.js';

export interface TextureCacheOptions {
  /** Maps a repo-relative asset path to something the renderer can fetch. */
  readonly resolveUrl?: (path: string) => string;
}

export interface TextureCache {
  /** Loads the atlases required by the given assets; safe to call repeatedly. */
  preload(assets: readonly (ResolvedAsset | undefined)[]): Promise<void>;
  /** Texture for an asset, cutting the atlas frame when the asset is packed. */
  textureFor(asset: ResolvedAsset | undefined): Promise<Texture | undefined>;
  /** Already-loaded texture, or undefined — for synchronous render paths. */
  peek(asset: ResolvedAsset | undefined): Texture | undefined;
  clear(): void;
  readonly loadedAtlases: readonly string[];
}

export function createTextureCache(options: TextureCacheOptions = {}): TextureCache {
  const resolveUrl = options.resolveUrl ?? ((path: string) => path);

  /** atlas file path (or standalone file) → base texture */
  const sources = new Map<string, Promise<Texture | undefined>>();
  /** asset id → framed texture */
  const frames = new Map<string, Texture>();
  const loaded = new Set<string>();

  function sourcePathOf(asset: ResolvedAsset): string {
    return asset.atlas?.file ?? asset.file;
  }

  async function loadSource(path: string): Promise<Texture | undefined> {
    const existing = sources.get(path);
    if (existing !== undefined) return existing;

    const pending = Assets.load<Texture>(resolveUrl(path))
      .then((texture) => {
        loaded.add(path);
        return texture;
      })
      .catch(() => undefined);

    sources.set(path, pending);
    return pending;
  }

  async function textureFor(asset: ResolvedAsset | undefined): Promise<Texture | undefined> {
    if (asset === undefined) return undefined;

    const cached = frames.get(asset.id);
    if (cached !== undefined) return cached;

    const base = await loadSource(sourcePathOf(asset));
    if (base === undefined) return undefined;

    // Standalone asset: the whole image is the texture.
    if (asset.atlas === undefined) {
      frames.set(asset.id, base);
      return base;
    }

    const { x, y, w, h } = asset.atlas.rect;
    const framed = new Texture({
      source: base.source,
      frame: new Rectangle(x, y, w, h),
    });

    frames.set(asset.id, framed);
    return framed;
  }

  return {
    async preload(assets) {
      const paths = new Set<string>();

      for (const asset of assets) {
        if (asset === undefined) continue;
        paths.add(sourcePathOf(asset));
      }

      await Promise.all([...paths].map((path) => loadSource(path)));
    },

    textureFor,

    peek(asset) {
      return asset === undefined ? undefined : frames.get(asset.id);
    },

    clear() {
      for (const texture of frames.values()) texture.destroy();
      frames.clear();
      sources.clear();
      loaded.clear();
    },

    get loadedAtlases(): readonly string[] {
      return [...loaded];
    },
  };
}
