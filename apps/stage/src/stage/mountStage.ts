/**
 * STAGE bootstrap (Blueprint §28–§31, §60, §65; Task 09).
 *
 * Startup order:
 *   1. create the Pixi application at the 9:16 design resolution;
 *   2. load the APPROVED manifest + atlas metadata, build the registry and resolve the theme;
 *   3. preload only the critical atlases, then build the scene;
 *   4. run the `stage:ready` handshake and rebuild from the snapshot;
 *   5. apply incremental events, ticking the effect scheduler each frame.
 *
 * Step 4 is why a STAGE reload never loses anything: canonical state lives in the Core Engine.
 */

import {
  createAssetRegistry,
  createAvatarCache,
  hashUrl,
  NEON_KAWAII_ARENA_THEME,
  parseAtlasMeta,
  parseProductionManifest,
  productionRootFor,
  resolveTheme,
  type AtlasMeta,
  type ResolvedTheme,
} from '@dance-arena/assets';
import type { DanceArenaStageBridge, PerformanceMode } from '@dance-arena/contracts';
import { DEFAULT_PERFORMANCE_PROFILES } from '@dance-arena/contracts';
import { Application, Texture } from 'pixi.js';

import { createPixiStageRenderer, criticalThemeAssets } from './pixi/pixiRenderer.js';
import { createTextureCache } from './pixi/textureCache.js';
import { createDefaultSlotLayout } from './slotLayout.js';
import { createStageScene, type StageScene } from './stageScene.js';
import { resolveStageSize, type StageSize } from './stageSize.js';

/** Where the approved pack lives, relative to the served STAGE bundle (locked revision). */
const PRODUCTION_ROOT = productionRootFor();

export interface MountStageOptions {
  readonly container: HTMLElement;
  readonly size?: Partial<StageSize>;
  readonly backgroundColor?: number;
  /** Injected in tests; production reads `window.danceArenaStage`. */
  readonly bridge?: DanceArenaStageBridge | undefined;
  readonly performanceMode?: PerformanceMode;
  /** Overrides how repo-relative asset paths become fetchable urls. */
  readonly resolveUrl?: (path: string) => string;
}

export interface MountedStage {
  readonly app: Application;
  readonly scene: StageScene;
  readonly theme: ResolvedTheme;
  readonly size: StageSize;
  destroy(): void;
}

/** Loads and validates the approved manifest + every atlas metadata file it declares. */
async function loadVisualPackage(
  resolveUrl: (path: string) => string,
): Promise<{ registry: ReturnType<typeof createAssetRegistry>; theme: ResolvedTheme }> {
  const manifestResponse = await fetch(resolveUrl(`${PRODUCTION_ROOT}/ASSET_MANIFEST.json`));
  const manifestJson: unknown = await manifestResponse.json();
  const manifest = parseProductionManifest(manifestJson);

  if (!manifest.ok) {
    throw new Error(`approved asset manifest is invalid: ${manifest.errors.join('; ')}`);
  }

  const atlases: Record<string, AtlasMeta> = {};
  await Promise.all(
    Object.keys(manifest.value.atlas).map(async (name) => {
      const response = await fetch(resolveUrl(`${manifest.value.runtimeRoot}/${name}.json`));
      const parsed = parseAtlasMeta(await response.json());

      if (parsed.ok) atlases[name] = parsed.value;
    }),
  );

  const registry = createAssetRegistry({
    manifest: manifest.value,
    atlases,
    fallbacks: {
      body: 'dancer-regular-01',
      'vip-body': 'dancer-vip-female-01',
      'avatar-fallback': 'avatar-default-happy',
      effect: 'fx-tier1-spark',
      reaction: 'reaction-happy',
    },
  });

  return { registry, theme: resolveTheme(NEON_KAWAII_ARENA_THEME, registry) };
}

export async function mountStage(options: MountStageOptions): Promise<MountedStage> {
  const size = resolveStageSize(options.size);
  const resolveUrl = options.resolveUrl ?? ((path: string) => `/${path}`);
  const profile = DEFAULT_PERFORMANCE_PROFILES[options.performanceMode ?? 'BALANCED'];

  const app = new Application();

  await app.init({
    width: size.width,
    height: size.height,
    background: options.backgroundColor ?? 0x05050b,
    antialias: true,
    autoDensity: true,
    resolution: globalThis.devicePixelRatio,
  });

  options.container.appendChild(app.canvas);

  const { theme } = await loadVisualPackage(resolveUrl);

  if (theme.unresolved.length > 0) {
    // Visible, not silent: an unresolved slot is a visual defect for QA, not a crash.
    console.warn(`[stage] unresolved theme slots: ${theme.unresolved.join(', ')}`);
  }

  const textures = createTextureCache({ resolveUrl });

  // Avatar bytes are cached with TTL; a failed load falls back to the approved default head.
  const avatars = createAvatarCache({
    clock: { now: () => Date.now() },
    hash: hashUrl,
    fetchAvatar: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`avatar ${response.status}`);

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mime: response.headers.get('content-type') ?? 'image/webp',
      };
    },
  });

  const avatarTexture = async (url: string | undefined): Promise<Texture | undefined> => {
    const cached = await avatars.get(url);
    if (cached === undefined) return undefined;

    // Textures come from the cached bytes, so a reload never re-downloads the same avatar.
    // Copy into a plain ArrayBuffer so the Blob input type is unambiguous across lib versions.
    const buffer = new ArrayBuffer(cached.bytes.byteLength);
    new Uint8Array(buffer).set(cached.bytes);

    const bitmap = await createImageBitmap(new Blob([buffer], { type: cached.mime }));
    return Texture.from(bitmap);
  };

  const renderer = createPixiStageRenderer({
    app,
    design: size,
    textures,
    resolveUrl,
    avatarTexture,
  });

  await textures.preload(criticalThemeAssets(theme));

  const scene = createStageScene({
    renderer,
    layout: createDefaultSlotLayout(),
    theme,
    profile,
  });

  const applyViewport = (): void => {
    const width = options.container.clientWidth || size.width;
    const height = options.container.clientHeight || size.height;

    app.renderer.resize(width, height);
    renderer.resize({ width, height });
  };

  applyViewport();
  globalThis.addEventListener('resize', applyViewport);

  // One tick drives effect expiry/promotion; no per-frame game state is ever received.
  const tick = (): void => scene.update();
  app.ticker.add(tick);

  const unsubscribes: (() => void)[] = [];
  const bridge = options.bridge;

  if (bridge !== undefined) {
    unsubscribes.push(bridge.onSnapshot((snapshot) => scene.applySnapshot(snapshot)));
    unsubscribes.push(bridge.onEvent((event) => scene.applyEvent(event)));

    // Handshake last, so no event that arrives during startup is missed.
    const { snapshot } = await bridge.ready();
    scene.applySnapshot(snapshot);
  }

  return {
    app,
    scene,
    theme,
    size,
    destroy(): void {
      globalThis.removeEventListener('resize', applyViewport);
      app.ticker.remove(tick);
      for (const unsubscribe of unsubscribes) unsubscribe();
      textures.clear();
      app.destroy(true, { children: true });
    },
  };
}
