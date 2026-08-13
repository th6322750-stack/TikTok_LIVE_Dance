/**
 * Theme definition (Blueprint §32 "no hard-coded asset paths in logic").
 *
 * A theme is DATA that binds visual SLOTS (background, costume pools, rank tiers, gift tiers, …) to
 * approved asset IDS. Swapping a theme or a visual revision means shipping another one of these —
 * never editing gameplay or renderer code.
 *
 * A theme may only reference ids; it can never introduce artwork, geometry or colours of its own.
 */

import { AssetIdSchema, NonEmptyStringSchema } from '@dance-arena/contracts';
import { z } from 'zod';

/** Visual treatment for a ranking band (Blueprint §24, VISUAL_CONTRACT rankVisual). */
export const RankTierThemeSchema = z.object({
  /** Inclusive rank range this tier covers. */
  fromRank: z.number().int().positive(),
  toRank: z.number().int().positive(),
  badge: AssetIdSchema.optional(),
  accessory: AssetIdSchema.optional(),
  /** Palette key from the visual contract, e.g. `gold`. Renderers map it to a colour. */
  aura: NonEmptyStringSchema.optional(),
  costumePool: z.enum(['regular', 'vip']),
});

export type RankTierTheme = z.infer<typeof RankTierThemeSchema>;

export const GiftTierThemeSchema = z.object({
  /** Engine tier id (`tier-1` … `tier-5`) — the engine already resolved which tier applies. */
  tierId: NonEmptyStringSchema,
  /** Engine effect preset name, kept so a preset-keyed lookup also works. */
  effectPreset: NonEmptyStringSchema.optional(),
  asset: AssetIdSchema,
  /** Additional approved variants; a renderer may rotate them to avoid visual repetition. */
  variants: z.array(AssetIdSchema).optional(),
  durationMs: z.number().int().nonnegative(),
  visualWeight: z.number().int().nonnegative(),
});

export type GiftTierTheme = z.infer<typeof GiftTierThemeSchema>;

/**
 * Rank accessory scale, from `VISUAL_CONTRACT.rankVisual.layout` and
 * `DANCE_LOCK.approvedGeometry`. Data, not code, so a revision can retune it without a rebuild.
 */
export const RankLayoutSchema = z.object({
  /** Crown width as a fraction of the rendered body width (R2: 0.44). */
  crownWidthBodyRatio: z.number().positive(),
  /** Rank badge width as a fraction of the rendered body width (R2: 0.27). */
  badgeWidthBodyRatio: z.number().positive(),
});

export type RankLayout = z.infer<typeof RankLayoutSchema>;

export const ThemeDefinitionSchema = z.object({
  themeId: NonEmptyStringSchema,
  themeName: z.string(),
  /** Visual revision this theme was authored against; must match the registry at resolve time. */
  visualRevision: NonEmptyStringSchema,
  rankLayout: RankLayoutSchema,
  background: AssetIdSchema,
  environment: z.object({
    vipPodium: AssetIdSchema.optional(),
    dj: AssetIdSchema.optional(),
  }),
  costumePools: z.object({
    regular: z.array(AssetIdSchema).min(1),
    vip: z.array(AssetIdSchema).min(1),
  }),
  avatarFallback: AssetIdSchema,
  rankTiers: z.array(RankTierThemeSchema).min(1),
  giftTiers: z.array(GiftTierThemeSchema).min(1),
  commandBubbles: z.record(z.string(), AssetIdSchema),
  reactions: z.record(z.string(), AssetIdSchema),
  /**
   * Auto Host celebration slots (Task 10 §8).
   *
   * Bound to APPROVED effect ids, exactly like every other slot. They are a separate slot family
   * from `giftTiers` so a host celebration can never be resolved as — or mistaken for — a gift
   * effect.
   */
  hostEffects: z.record(z.string(), AssetIdSchema),
  ui: z.object({
    partyGoalFrame: AssetIdSchema.optional(),
    newVip: AssetIdSchema.optional(),
    top1Banner: AssetIdSchema.optional(),
    nowPlaying: AssetIdSchema.optional(),
  }),
  /** Palette from the visual contract; renderers read colours from here, never literals. */
  palette: z.record(z.string(), z.string()),
  /** Normalized stage zones from the visual contract. */
  zones: z.object({
    normal: z.object({ yMin: z.number(), yMax: z.number() }),
    vip: z.object({ yMin: z.number(), yMax: z.number() }),
    dj: z.object({ yMin: z.number(), yMax: z.number() }),
  }),
});

export type ThemeDefinition = z.infer<typeof ThemeDefinitionSchema>;
