/**
 * DA-QA-005 regression — LOW mode must keep tier-4/tier-5 takeovers at full size.
 *
 * Numbers come straight from `.dance/VISUAL_CONTRACT.json` performanceModes and
 * `.dance/DANCE_LOCK.json` approvedGeometry, so a contract change fails this suite.
 */

import { DEFAULT_PERFORMANCE_PROFILES, TAKEOVER_COVERAGE_MIN } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { resolveEffectCoverage } from './effectCoverage.js';

const LOW = DEFAULT_PERFORMANCE_PROFILES.LOW;
const BALANCED = DEFAULT_PERFORMANCE_PROFILES.BALANCED;
const ULTRA = DEFAULT_PERFORMANCE_PROFILES.ULTRA;

describe('LOW mode takeover minima (DA-QA-005)', () => {
  it('keeps tier-4 at or above 0.82 stage width', () => {
    expect(resolveEffectCoverage({ weight: 4, profile: LOW })).toBeGreaterThanOrEqual(0.82);
  });

  it('keeps tier-5 at or above 1.00 stage width', () => {
    expect(resolveEffectCoverage({ weight: 5, profile: LOW })).toBeGreaterThanOrEqual(1);
  });

  it('does not let the low particleScale shrink a takeover', () => {
    // The regression was multiplying coverage by particleScale (0.35 in LOW).
    const tier4 = resolveEffectCoverage({ weight: 4, profile: LOW });
    const tier5 = resolveEffectCoverage({ weight: 5, profile: LOW });

    expect(tier4).toBeGreaterThan(0.82 * LOW.particleScale);
    expect(tier5).toBeGreaterThan(1 * LOW.particleScale);
    expect(tier4).toBe(TAKEOVER_COVERAGE_MIN.tier4);
    expect(tier5).toBe(TAKEOVER_COVERAGE_MIN.tier5);
  });

  it('caps tiers 1-3 at 0.62 stage width so small gifts stay small', () => {
    for (const weight of [1, 2, 3]) {
      expect(resolveEffectCoverage({ weight, profile: LOW })).toBeLessThanOrEqual(0.62);
    }
  });

  it('still orders the small tiers by weight', () => {
    const tier1 = resolveEffectCoverage({ weight: 1, profile: LOW });
    const tier2 = resolveEffectCoverage({ weight: 2, profile: LOW });
    const tier3 = resolveEffectCoverage({ weight: 3, profile: LOW });

    expect(tier1).toBeLessThan(tier2);
    expect(tier2).toBeLessThan(tier3);
  });
});

describe('every mode honours the takeover floors', () => {
  it.each([
    ['LOW', LOW],
    ['BALANCED', BALANCED],
    ['ULTRA', ULTRA],
  ])('%s keeps tier-4 >= 0.82 and tier-5 >= 1.00', (_name, profile) => {
    expect(resolveEffectCoverage({ weight: 4, profile })).toBeGreaterThanOrEqual(
      TAKEOVER_COVERAGE_MIN.tier4,
    );
    expect(resolveEffectCoverage({ weight: 5, profile })).toBeGreaterThanOrEqual(
      TAKEOVER_COVERAGE_MIN.tier5,
    );
  });

  it('never renders a takeover smaller in a richer mode', () => {
    for (const weight of [4, 5]) {
      const low = resolveEffectCoverage({ weight, profile: LOW });
      const ultra = resolveEffectCoverage({ weight, profile: ULTRA });

      expect(ultra).toBeGreaterThanOrEqual(low);
    }
  });

  it('lets richer modes draw the small tiers larger than LOW', () => {
    expect(resolveEffectCoverage({ weight: 3, profile: ULTRA })).toBeGreaterThan(
      resolveEffectCoverage({ weight: 3, profile: LOW }),
    );
  });
});

describe('largeTakeovers disabled', () => {
  const noTakeovers = { ...LOW, largeTakeovers: false };

  it('drops the floor when the profile forbids takeovers', () => {
    expect(resolveEffectCoverage({ weight: 5, profile: noTakeovers })).toBeLessThan(1);
  });
});

describe('bounds', () => {
  it('clamps an out-of-range weight instead of producing nonsense', () => {
    expect(resolveEffectCoverage({ weight: 0, profile: ULTRA })).toBeGreaterThan(0);
    expect(resolveEffectCoverage({ weight: 99, profile: LOW })).toBe(TAKEOVER_COVERAGE_MIN.tier5);
  });
});
