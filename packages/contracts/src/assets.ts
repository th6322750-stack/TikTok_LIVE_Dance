/**
 * Asset & theme contracts (Blueprint §32–§34, §64–§65; `.dance` visual protocol).
 *
 * These describe how the system REFERS to artwork, never what the artwork looks like. Visual truth
 * belongs to ChatGPT/System Architect via `.dance/ASSET_MANIFEST.json`; this file only gives the
 * rest of the code a typed vocabulary of asset ids, categories, sockets and performance modes.
 *
 * Nothing here may contain a file path: paths live in the manifest so a theme or revision swap
 * never requires a code change (Blueprint §32).
 */

import { z } from 'zod';

import { NonEmptyStringSchema, NonNegativeIntSchema, NormalizedUnitSchema } from './common.js';

/** Stable id of a logical asset, e.g. `dancer-regular-01`. */
export const AssetIdSchema = NonEmptyStringSchema;

export type AssetId = string;

/**
 * Categories published by the locked manifest.
 *
 * Blueprint §32 lists a smaller set (body/vip-body/effect/background/dj/ui); the approved manifest
 * refines it, and the manifest is the authority, so the fuller list is modelled here.
 */
export const ASSET_CATEGORIES = [
  'body',
  'vip-body',
  'reaction',
  'command-bubble',
  'gift-item',
  'effect',
  'accessory',
  'rank-badge',
  'environment',
  'ui',
  'background',
  'avatar-fallback',
  'dj',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const AssetCategorySchema = z.enum(ASSET_CATEGORIES);

/**
 * Circular socket where the TikTok avatar is composited onto a body (Blueprint §31).
 *
 * Normalized to the body frame so the same socket works at any render resolution. Avatar placement
 * must always come from here — never from costume artwork guesswork or nickname/avatar dimensions.
 */
export const HeadSocketSchema = z.object({
  x: NormalizedUnitSchema,
  y: NormalizedUnitSchema,
  /** Radius as a fraction of body width. */
  radius: NormalizedUnitSchema,
});

export type HeadSocket = z.infer<typeof HeadSocketSchema>;

/** Where a renderer should draw an asset relative to its own box. */
export const PivotSchema = z.object({ x: z.number(), y: z.number() });

export type Pivot = z.infer<typeof PivotSchema>;

// ── Performance modes (Blueprint §64) ─────────────────────────────────────────────────────────

export const PERFORMANCE_MODES = ['LOW', 'BALANCED', 'ULTRA'] as const;

export type PerformanceMode = (typeof PERFORMANCE_MODES)[number];

export const PerformanceModeSchema = z.enum(PERFORMANCE_MODES);

/**
 * Gift effect coverage bounds, as a fraction of STAGE WIDTH
 * (`VISUAL_CONTRACT.performanceModes.*.coverage`).
 *
 * The takeover minima are a floor, not a target: `particleScale` may thin out density and
 * concurrency, but it must never shrink a tier-4/tier-5 takeover below these values while
 * `largeTakeovers` is true (defect DA-QA-005).
 */
export const EffectCoverageSchema = z.object({
  /** Upper bound for the small tiers, so a tier-1 spark never fills the stage. */
  tier1to3Max: z.number().positive().optional(),
  tier4Min: z.number().positive(),
  tier5Min: z.number().positive(),
});

export type EffectCoverage = z.infer<typeof EffectCoverageSchema>;

export const PerformanceProfileSchema = z.object({
  mode: PerformanceModeSchema,
  /** Recommended dancer cap; the engine still owns the authoritative `maxDancers`. */
  maxRecommendedDancers: z.number().int().min(1).max(30),
  /** Multiplier applied to particle/effect density. */
  particleScale: z.number().min(0).max(1),
  /** Whether full-screen takeover effects are allowed. */
  largeTakeovers: z.boolean(),
  /** Concurrent gift effects allowed on stage before new ones are queued or dropped. */
  maxConcurrentEffects: NonNegativeIntSchema,
  coverage: EffectCoverageSchema,
});

export type PerformanceProfile = z.infer<typeof PerformanceProfileSchema>;

/**
 * Takeover floors that hold in EVERY mode: a higher-fidelity mode may go bigger, never smaller
 * (`DANCE_LOCK.approvedGeometry.lowTier4CoverageMin` / `lowTier5CoverageMin`).
 */
export const TAKEOVER_COVERAGE_MIN = { tier4: 0.82, tier5: 1.0 } as const;

/** Defaults from `.dance/VISUAL_CONTRACT.json`; concurrency caps are an implementation concern. */
export const DEFAULT_PERFORMANCE_PROFILES: Readonly<Record<PerformanceMode, PerformanceProfile>> = {
  LOW: {
    mode: 'LOW',
    maxRecommendedDancers: 15,
    particleScale: 0.35,
    largeTakeovers: true,
    maxConcurrentEffects: 3,
    // LOW is the only mode the contract caps for the small tiers.
    coverage: {
      tier1to3Max: 0.62,
      tier4Min: TAKEOVER_COVERAGE_MIN.tier4,
      tier5Min: TAKEOVER_COVERAGE_MIN.tier5,
    },
  },
  BALANCED: {
    mode: 'BALANCED',
    maxRecommendedDancers: 25,
    particleScale: 0.7,
    largeTakeovers: true,
    maxConcurrentEffects: 6,
    coverage: { tier4Min: TAKEOVER_COVERAGE_MIN.tier4, tier5Min: TAKEOVER_COVERAGE_MIN.tier5 },
  },
  ULTRA: {
    mode: 'ULTRA',
    maxRecommendedDancers: 30,
    particleScale: 1,
    largeTakeovers: true,
    maxConcurrentEffects: 10,
    coverage: { tier4Min: TAKEOVER_COVERAGE_MIN.tier4, tier5Min: TAKEOVER_COVERAGE_MIN.tier5 },
  },
};

// ── Theme summary shared with renderers/CONTROL ────────────────────────────────────────────────

/**
 * What CONTROL and STAGE need to know about the active theme without reading the manifest
 * themselves.
 */
export const ThemeSummarySchema = z.object({
  themeId: NonEmptyStringSchema,
  themeName: z.string(),
  visualRevision: NonEmptyStringSchema,
  assetCount: NonNegativeIntSchema,
  performanceMode: PerformanceModeSchema,
  /** Asset ids referenced by the theme that the manifest could not resolve. */
  unresolvedSlots: z.array(z.string()),
});

export type ThemeSummary = z.infer<typeof ThemeSummarySchema>;
