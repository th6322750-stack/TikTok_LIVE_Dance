/**
 * Theme resolution.
 *
 * Binds a theme's asset IDS to concrete registry entries and reports every slot that could not be
 * resolved. Resolution NEVER throws and never substitutes silently: an unresolved slot is returned
 * in `unresolved` so STAGE can degrade visibly and the receipt/QA can list it.
 *
 * This is also the guard against a theme authored for a different visual revision.
 */

import type { AssetCategory, AssetId, PerformanceMode, ThemeSummary } from '@dance-arena/contracts';
import { DEFAULT_PERFORMANCE_PROFILES } from '@dance-arena/contracts';

import type { AssetRegistry, ResolvedAsset } from '../registry/assetRegistry.js';
import type { GiftTierTheme, RankLayout, RankTierTheme, ThemeDefinition } from './themeSchema.js';

export interface ResolvedRankTier extends Omit<RankTierTheme, 'badge' | 'accessory'> {
  readonly badge?: ResolvedAsset;
  readonly accessory?: ResolvedAsset;
}

export interface ResolvedGiftTier extends Omit<GiftTierTheme, 'asset' | 'variants'> {
  readonly asset: ResolvedAsset;
  readonly variants: readonly ResolvedAsset[];
}

export interface ResolvedTheme {
  readonly themeId: string;
  readonly themeName: string;
  readonly visualRevision: string;
  /** Approved crown/badge scale, passed through to renderers verbatim (DA-QA-003). */
  readonly rankLayout: RankLayout;
  readonly background?: ResolvedAsset;
  readonly vipPodium?: ResolvedAsset;
  readonly dj?: ResolvedAsset;
  readonly regularCostumes: readonly ResolvedAsset[];
  readonly vipCostumes: readonly ResolvedAsset[];
  readonly avatarFallback?: ResolvedAsset;
  readonly rankTiers: readonly ResolvedRankTier[];
  readonly giftTiers: readonly ResolvedGiftTier[];
  readonly commandBubbles: Readonly<Record<string, ResolvedAsset>>;
  readonly reactions: Readonly<Record<string, ResolvedAsset>>;
  readonly ui: Readonly<Record<string, ResolvedAsset>>;
  readonly palette: Readonly<Record<string, string>>;
  readonly zones: ThemeDefinition['zones'];
  /** `slot -> assetId` pairs the registry could not resolve. */
  readonly unresolved: readonly string[];
  /** True when the theme was authored for another visual revision than the registry provides. */
  readonly revisionMismatch: boolean;
  /** Atlas names required by everything this theme references — feeds lazy loading. */
  readonly requiredAtlases: readonly string[];
  summary(mode: PerformanceMode): ThemeSummary;
}

export function resolveTheme(theme: ThemeDefinition, registry: AssetRegistry): ResolvedTheme {
  const unresolved: string[] = [];
  const referenced: AssetId[] = [];

  const pick = (
    slot: string,
    id: AssetId | undefined,
    category: AssetCategory,
  ): ResolvedAsset | undefined => {
    if (id === undefined) return undefined;

    referenced.push(id);
    const asset = registry.resolve({ id, category });

    if (asset === undefined) unresolved.push(`${slot}=${id}`);
    else if (asset.isFallback) unresolved.push(`${slot}=${id} (fell back to ${asset.id})`);

    return asset;
  };

  const pickMany = (
    slot: string,
    ids: readonly AssetId[],
    category: AssetCategory,
  ): ResolvedAsset[] =>
    ids
      .map((id, index) => pick(`${slot}[${index}]`, id, category))
      .filter((asset): asset is ResolvedAsset => asset !== undefined);

  const background = pick('background', theme.background, 'background');
  const vipPodium = pick('environment.vipPodium', theme.environment.vipPodium, 'environment');
  const dj = pick('environment.dj', theme.environment.dj, 'dj');
  const avatarFallback = pick('avatarFallback', theme.avatarFallback, 'avatar-fallback');

  const regularCostumes = pickMany('costumePools.regular', theme.costumePools.regular, 'body');
  const vipCostumes = pickMany('costumePools.vip', theme.costumePools.vip, 'vip-body');

  const rankTiers: ResolvedRankTier[] = theme.rankTiers.map((tier) => {
    const badge = pick(`rank[${tier.fromRank}].badge`, tier.badge, 'rank-badge');
    const accessory = pick(`rank[${tier.fromRank}].accessory`, tier.accessory, 'accessory');

    return {
      fromRank: tier.fromRank,
      toRank: tier.toRank,
      costumePool: tier.costumePool,
      ...(tier.aura === undefined ? {} : { aura: tier.aura }),
      ...(badge === undefined ? {} : { badge }),
      ...(accessory === undefined ? {} : { accessory }),
    };
  });

  const giftTiers: ResolvedGiftTier[] = [];
  for (const tier of theme.giftTiers) {
    const asset = pick(`gift[${tier.tierId}]`, tier.asset, 'effect');
    if (asset === undefined) continue;

    giftTiers.push({
      tierId: tier.tierId,
      ...(tier.effectPreset === undefined ? {} : { effectPreset: tier.effectPreset }),
      durationMs: tier.durationMs,
      visualWeight: tier.visualWeight,
      asset,
      variants: pickMany(`gift[${tier.tierId}].variants`, tier.variants ?? [], 'effect'),
    });
  }

  const resolveRecord = (
    slot: string,
    entries: Readonly<Record<string, AssetId>>,
    category: AssetCategory,
  ): Record<string, ResolvedAsset> => {
    const resolved: Record<string, ResolvedAsset> = {};

    for (const [key, id] of Object.entries(entries)) {
      const asset = pick(`${slot}.${key}`, id, category);
      if (asset !== undefined) resolved[key] = asset;
    }

    return resolved;
  };

  const commandBubbles = resolveRecord('commandBubbles', theme.commandBubbles, 'command-bubble');
  const reactions = resolveRecord('reactions', theme.reactions, 'reaction');

  const ui = resolveRecord(
    'ui',
    Object.fromEntries(
      Object.entries(theme.ui).filter(
        (entry): entry is [string, AssetId] => entry[1] !== undefined,
      ),
    ),
    'ui',
  );

  const revisionMismatch = theme.visualRevision !== registry.visualRevision;
  if (revisionMismatch) {
    unresolved.push(
      `visualRevision=${theme.visualRevision} (registry provides ${registry.visualRevision})`,
    );
  }

  const requiredAtlases = registry.atlasesFor(referenced);

  return {
    themeId: theme.themeId,
    themeName: theme.themeName,
    visualRevision: theme.visualRevision,
    rankLayout: theme.rankLayout,
    ...(background === undefined ? {} : { background }),
    ...(vipPodium === undefined ? {} : { vipPodium }),
    ...(dj === undefined ? {} : { dj }),
    regularCostumes,
    vipCostumes,
    ...(avatarFallback === undefined ? {} : { avatarFallback }),
    rankTiers,
    giftTiers,
    commandBubbles,
    reactions,
    ui,
    palette: theme.palette,
    zones: theme.zones,
    unresolved,
    revisionMismatch,
    requiredAtlases,

    summary(mode: PerformanceMode): ThemeSummary {
      return {
        themeId: theme.themeId,
        themeName: theme.themeName,
        visualRevision: theme.visualRevision,
        assetCount: registry.assetCount,
        performanceMode: DEFAULT_PERFORMANCE_PROFILES[mode].mode,
        unresolvedSlots: [...unresolved],
      };
    },
  };
}

// ── Lookup helpers used by renderers ──────────────────────────────────────────────────────────

/** Rank tier covering a rank, or undefined when the rank is outside every band. */
export function rankTierFor(theme: ResolvedTheme, rank: number): ResolvedRankTier | undefined {
  return theme.rankTiers.find((tier) => rank >= tier.fromRank && rank <= tier.toRank);
}

/** Gift visuals for an engine-resolved tier id, with an effect-preset fallback. */
export function giftTierFor(
  theme: ResolvedTheme,
  tierId: string,
  effectPreset?: string,
): ResolvedGiftTier | undefined {
  return (
    theme.giftTiers.find((tier) => tier.tierId === tierId) ??
    (effectPreset === undefined
      ? undefined
      : theme.giftTiers.find((tier) => tier.effectPreset === effectPreset))
  );
}

/**
 * Deterministic costume choice.
 *
 * Keyed by userId so the same viewer keeps the same body across respawns and STAGE reloads, without
 * the engine having to store a costume assignment.
 */
export function costumeFor(
  theme: ResolvedTheme,
  userId: string,
  zone: 'normal' | 'vip',
): ResolvedAsset | undefined {
  const pool = zone === 'vip' ? theme.vipCostumes : theme.regularCostumes;
  if (pool.length === 0) return undefined;

  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) % 0x7fffffff;
  }

  return pool[hash % pool.length];
}
