/**
 * Gift effect coverage (defect DA-QA-005).
 *
 * Coverage is the sprite width as a fraction of STAGE WIDTH. Two rules from
 * `.dance/VISUAL_CONTRACT.json` have to hold at the same time:
 *
 *  1. a small gift must stay small — LOW caps tiers 1–3 at 0.62 stage width;
 *  2. a takeover must stay a takeover — tier-4 ≥ 0.82 and tier-5 ≥ 1.00 stage width whenever
 *     `largeTakeovers` is true, EVEN in LOW.
 *
 * The previous implementation multiplied one coverage figure by `particleScale`, which shrank
 * tier-4/tier-5 below those minima in LOW mode. `particleScale` now only affects the base ramp
 * (density feel) and can never pull a takeover under its floor.
 */

import type { PerformanceProfile } from '@dance-arena/contracts';

/** Visual weight above which an effect counts as a full takeover. */
const TIER4_WEIGHT = 4;
const TIER5_WEIGHT = 5;

export interface EffectCoverageInput {
  /** Theme/engine visual weight: 1..5 for tier-1..tier-5. */
  readonly weight: number;
  readonly profile: PerformanceProfile;
}

/**
 * Base ramp: heavier tiers are wider, and a lower particle scale trims the ramp a little so LOW
 * feels calmer. Deliberately bounded well under 1 so the floors below are what decide takeovers.
 */
function baseCoverage(weight: number, particleScale: number): number {
  const byWeight = 0.35 + 0.13 * Math.max(1, Math.min(weight, TIER5_WEIGHT));
  const byDensity = 0.7 + 0.3 * particleScale;

  return byWeight * byDensity;
}

export function resolveEffectCoverage({ weight, profile }: EffectCoverageInput): number {
  const base = baseCoverage(weight, profile.particleScale);

  if (weight >= TIER5_WEIGHT) {
    return profile.largeTakeovers ? Math.max(base, profile.coverage.tier5Min) : base;
  }

  if (weight >= TIER4_WEIGHT) {
    return profile.largeTakeovers ? Math.max(base, profile.coverage.tier4Min) : base;
  }

  // Small tiers: honour the cap when the mode declares one.
  const cap = profile.coverage.tier1to3Max;
  return cap === undefined ? base : Math.min(base, cap);
}
