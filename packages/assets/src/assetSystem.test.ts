import { DEFAULT_PERFORMANCE_PROFILES } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { LOCKED_VISUAL_REVISION } from './index.js';
import { parseProductionManifest } from './manifest/schema.js';
import { createAssetRegistry } from './registry/assetRegistry.js';
import { NEON_KAWAII_ARENA_THEME } from './theme/neonKawaiiArena.js';
import { costumeFor, giftTierFor, rankTierFor, resolveTheme } from './theme/resolveTheme.js';
import {
  loadLockedAtlases,
  loadLockedManifest,
  PRODUCTION_ROOT,
  runtimeFileExists,
} from './testing/loadProductionManifest.js';

const manifest = loadLockedManifest();
const atlases = loadLockedAtlases(manifest);

const registry = createAssetRegistry({
  manifest,
  atlases,
  fallbacks: {
    body: 'dancer-regular-01',
    'vip-body': 'dancer-vip-female-01',
    'avatar-fallback': 'avatar-default-happy',
    effect: 'fx-tier1-spark',
    reaction: 'reaction-happy',
  },
});

describe('locked manifest (DA-VISUAL-R2)', () => {
  it('parses the approved manifest shipped in the repository', () => {
    expect(manifest.visualRevision).toBe(LOCKED_VISUAL_REVISION);
    expect(manifest.status).toBe('APPROVED_LOCKED');
    expect(manifest.assetCount).toBe(104);
    expect(manifest.assets).toHaveLength(104);
    expect(manifest.productionRoot).toBe(PRODUCTION_ROOT);
  });

  it('carries a DISTINCT head socket per dancer body (DA-QA-001 fix)', () => {
    const sockets = manifest.assets
      .filter((asset) => asset.category === 'body' || asset.category === 'vip-body')
      .map((asset) => asset.headSocket?.normalized.join(','));

    expect(sockets).toHaveLength(22);
    expect(sockets.every((socket) => socket !== undefined)).toBe(true);
    // R1 standardized these; R2 must measure each body, so most values differ.
    expect(new Set(sockets).size).toBeGreaterThan(15);
  });

  it('rejects a manifest whose assetCount disagrees with its asset list', () => {
    const result = parseProductionManifest({ ...manifest, assetCount: 99 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('assetCount');
  });

  it('rejects a manifest with duplicate asset ids', () => {
    const first = manifest.assets[0];
    expect(first).toBeDefined();

    const result = parseProductionManifest({
      ...manifest,
      assetCount: manifest.assetCount + 1,
      assets: [...manifest.assets, first],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a malformed asset entry instead of loading it', () => {
    const result = parseProductionManifest({
      ...manifest,
      assets: [{ id: 'broken', category: 'not-a-category', webp: '', width: -1, height: 0 }],
      assetCount: 1,
    });

    expect(result.ok).toBe(false);
  });

  it('ships every runtime atlas and its frame metadata', () => {
    expect(Object.keys(manifest.atlas)).toHaveLength(7);

    for (const name of Object.keys(manifest.atlas)) {
      expect(atlases[name]?.frames).toBeDefined();
      expect(runtimeFileExists(`${PRODUCTION_ROOT}/runtime/${name}.webp`)).toBe(true);
    }
  });
});

describe('AssetRegistry', () => {
  it('resolves an asset to its atlas frame, preferring the WebP atlas', () => {
    const asset = registry.get('dancer-regular-01');

    expect(asset).toBeDefined();
    expect(asset?.atlas?.name).toBe('dancers-regular');
    expect(asset?.atlas?.rect).toMatchObject({ x: 0, y: 0, w: 256, h: 384 });
    expect(asset?.file).toContain(`${PRODUCTION_ROOT}/individual/dancers/regular`);
  });

  it('exposes the per-asset normalized head socket, not a hard-coded value', () => {
    const first = registry.get('dancer-regular-01');
    const second = registry.get('dancer-regular-02');
    const vip = registry.get('dancer-vip-female-01');

    for (const asset of [first, second, vip]) {
      expect(asset?.headSocket).toBeDefined();
      expect(asset?.headSocket?.x).toBeGreaterThan(0);
      expect(asset?.headSocket?.x).toBeLessThan(1);
      expect(asset?.headSocket?.radius).toBeGreaterThan(0);
    }

    // Two different bodies must not share a socket, and VIP differs from regular.
    expect(first?.headSocket).not.toEqual(second?.headSocket);
    expect(vip?.headSocket?.y).not.toBeCloseTo(first?.headSocket?.y ?? 0, 3);
  });

  it('groups assets by category with the counts the manifest declares', () => {
    expect(registry.idsByCategory('body')).toHaveLength(12);
    expect(registry.idsByCategory('vip-body')).toHaveLength(10);
    expect(registry.idsByCategory('reaction')).toHaveLength(24);
    expect(registry.idsByCategory('command-bubble')).toHaveLength(14);
    expect(registry.idsByCategory('rank-badge')).toHaveLength(10);
    expect(registry.idsByCategory('effect')).toHaveLength(16);
  });

  it('falls back within the same category for a missing asset', () => {
    const asset = registry.resolve({ id: 'dancer-regular-99', category: 'body' });

    expect(asset).toBeDefined();
    expect(asset?.id).toBe('dancer-regular-01');
    expect(asset?.isFallback).toBe(true);
    expect(registry.missing).toContain('dancer-regular-99');
  });

  it('returns undefined when a missing asset has no category fallback', () => {
    expect(registry.resolve({ id: 'ui-does-not-exist', category: 'ui' })).toBeUndefined();
    expect(registry.get('ui-does-not-exist')).toBeUndefined();
  });

  it('reports only the atlases needed for a set of ids, for lazy loading', () => {
    expect(registry.atlasesFor(['dancer-regular-01', 'dancer-regular-05'])).toEqual([
      'dancers-regular',
    ]);
    expect(registry.atlasesFor(['dancer-regular-01', 'fx-tier5-cosmic-purple']).sort()).toEqual([
      'dancers-regular',
      'gifts-fx',
    ]);
    expect(registry.atlasesFor([])).toEqual([]);
  });

  it('resolves atlas file paths under the runtime root', () => {
    expect(registry.atlasFile('stage-ui')).toBe(`${PRODUCTION_ROOT}/runtime/stage-ui.webp`);
    expect(registry.atlasFile('nope')).toBeUndefined();
  });

  it('still resolves an asset when atlas metadata is unavailable', () => {
    const withoutAtlases = createAssetRegistry({ manifest });
    const asset = withoutAtlases.get('dancer-regular-01');

    expect(asset?.atlas).toBeUndefined();
    // Individual WebP remains as the fallback source (locked rule 5).
    expect(asset?.file).toContain('.webp');
  });
});

describe('theme resolution (Neon Kawaii Arena)', () => {
  const theme = resolveTheme(NEON_KAWAII_ARENA_THEME, registry);

  it('resolves every slot the theme references against the locked package', () => {
    expect(theme.unresolved).toEqual([]);
    expect(theme.revisionMismatch).toBe(false);
  });

  it('binds background, VIP podium and avatar fallback', () => {
    expect(theme.background?.id).toBe('stage-bg-neon-kawaii');
    expect(theme.vipPodium?.id).toBe('stage-vip-podium');
    expect(theme.avatarFallback?.id).toBe('avatar-default-happy');
  });

  it('provides full costume pools for both zones', () => {
    expect(theme.regularCostumes).toHaveLength(12);
    expect(theme.vipCostumes).toHaveLength(10);
    expect(theme.regularCostumes.every((asset) => asset.category === 'body')).toBe(true);
    expect(theme.vipCostumes.every((asset) => asset.category === 'vip-body')).toBe(true);
  });

  it('covers ranks 1..10 with a badge, and crowns the top three', () => {
    for (let rank = 1; rank <= 10; rank += 1) {
      const tier = rankTierFor(theme, rank);

      expect(tier, `rank ${rank}`).toBeDefined();
      expect(tier?.badge?.id).toBe(`rank-badge-${String(rank).padStart(2, '0')}`);
      expect(tier?.costumePool).toBe('vip');
    }

    expect(rankTierFor(theme, 1)?.accessory?.id).toBe('crown-gold');
    expect(rankTierFor(theme, 2)?.accessory?.id).toBe('crown-blue');
    expect(rankTierFor(theme, 3)?.accessory?.id).toBe('crown-pink');
    expect(rankTierFor(theme, 4)?.accessory).toBeUndefined();
    expect(rankTierFor(theme, 11)).toBeUndefined();
  });

  it('maps every engine gift tier to an approved effect asset', () => {
    for (const tierId of ['tier-1', 'tier-2', 'tier-3', 'tier-4', 'tier-5']) {
      const tier = giftTierFor(theme, tierId);

      expect(tier, tierId).toBeDefined();
      expect(tier?.asset.category).toBe('effect');
      expect(tier?.durationMs).toBeGreaterThan(0);
    }
  });

  it('also resolves a gift tier by the engine effect preset name', () => {
    expect(giftTierFor(theme, 'unknown-tier', 'mega-cosmic')?.tierId).toBe('tier-5');
    expect(giftTierFor(theme, 'unknown-tier', 'nope')).toBeUndefined();
  });

  it('offers approved variants so repeated gifts are not visually identical', () => {
    expect(giftTierFor(theme, 'tier-2')?.variants.length).toBeGreaterThan(0);
    expect(
      giftTierFor(theme, 'tier-5')?.variants.every((asset) => asset.category === 'effect'),
    ).toBe(true);
  });

  it('picks a deterministic costume per user so a respawn keeps the same body', () => {
    const first = costumeFor(theme, 'user-123', 'normal');
    const again = costumeFor(theme, 'user-123', 'normal');

    expect(first?.id).toBe(again?.id);
    expect(costumeFor(theme, 'user-123', 'vip')?.category).toBe('vip-body');
  });

  it('spreads costumes across the pool rather than always picking the first', () => {
    const chosen = new Set(
      Array.from(
        { length: 60 },
        (_unused, index) => costumeFor(theme, `user-${index}`, 'normal')?.id,
      ),
    );

    expect(chosen.size).toBeGreaterThan(3);
  });

  it('reports unresolved slots instead of inventing artwork', () => {
    const broken = resolveTheme(
      {
        ...NEON_KAWAII_ARENA_THEME,
        background: 'stage-bg-does-not-exist',
        ui: { top1Banner: 'ui-missing' },
      },
      registry,
    );

    expect(broken.background).toBeUndefined();
    expect(broken.unresolved).toContain('background=stage-bg-does-not-exist');
    expect(broken.unresolved).toContain('ui.top1Banner=ui-missing');
  });

  it('flags a theme authored for a different visual revision', () => {
    const future = resolveTheme(
      { ...NEON_KAWAII_ARENA_THEME, visualRevision: 'DA-VISUAL-R3' },
      registry,
    );

    expect(future.revisionMismatch).toBe(true);
    expect(future.unresolved.some((slot) => slot.startsWith('visualRevision='))).toBe(true);
  });

  it('lists exactly the atlases its assets need', () => {
    expect([...theme.requiredAtlases].sort()).toEqual([
      'bubbles',
      'dancers-regular',
      'dancers-vip',
      'gifts-fx',
      'rank-accessories',
      'reactions',
      'stage-ui',
    ]);
  });

  it('summarises itself for CONTROL without leaking paths', () => {
    const summary = theme.summary('BALANCED');

    expect(summary).toMatchObject({
      themeId: 'neon-kawaii-arena',
      visualRevision: LOCKED_VISUAL_REVISION,
      assetCount: 104,
      performanceMode: 'BALANCED',
      unresolvedSlots: [],
    });
    expect(JSON.stringify(summary)).not.toContain('assets/production');
  });
});

describe('performance profiles (Blueprint §64)', () => {
  it('matches the caps in the visual contract', () => {
    expect(DEFAULT_PERFORMANCE_PROFILES.LOW.maxRecommendedDancers).toBe(15);
    expect(DEFAULT_PERFORMANCE_PROFILES.BALANCED.maxRecommendedDancers).toBe(25);
    expect(DEFAULT_PERFORMANCE_PROFILES.ULTRA.maxRecommendedDancers).toBe(30);
    expect(DEFAULT_PERFORMANCE_PROFILES.LOW.particleScale).toBeLessThan(
      DEFAULT_PERFORMANCE_PROFILES.ULTRA.particleScale,
    );
  });

  it('caps concurrent effects more aggressively in LOW than ULTRA', () => {
    expect(DEFAULT_PERFORMANCE_PROFILES.LOW.maxConcurrentEffects).toBeLessThan(
      DEFAULT_PERFORMANCE_PROFILES.ULTRA.maxConcurrentEffects,
    );
  });
});
