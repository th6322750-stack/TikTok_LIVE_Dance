/**
 * DA-VISUAL-R2 — "Neon Kawaii Arena" theme binding.
 *
 * PURE DATA. Every id below exists in the APPROVED_LOCKED manifest; nothing is recoloured, cropped
 * or invented (locked rule 3). Zones, palette and rank layout are copied from
 * `.dance/VISUAL_CONTRACT.json`, which is `APPROVED_LOCKED` as of R2.
 *
 * R2 closed DA-REQ-001: the contract now names the real production ids, so every slot below is a
 * direct binding with no substitution. Per-asset `headSocket` metadata is authoritative (R2 fixed
 * the sockets that R1 had standardized), and DJ artwork stays deferred to Task 11.
 */

import type { ThemeDefinition } from './themeSchema.js';

const REGULAR_POOL = Array.from(
  { length: 12 },
  (_unused, index) => `dancer-regular-${String(index + 1).padStart(2, '0')}`,
);

const VIP_POOL = [
  'dancer-vip-female-01',
  'dancer-vip-female-02',
  'dancer-vip-female-03',
  'dancer-vip-female-04',
  'dancer-vip-female-05',
  'dancer-vip-male-01',
  'dancer-vip-male-02',
  'dancer-vip-male-03',
  'dancer-vip-male-04',
  'dancer-vip-male-05',
];

export const NEON_KAWAII_ARENA_THEME: ThemeDefinition = {
  themeId: 'neon-kawaii-arena',
  themeName: 'Neon Kawaii Arena',
  visualRevision: 'DA-VISUAL-R2',

  // VISUAL_CONTRACT.rankVisual.layout / DANCE_LOCK.approvedGeometry (DA-QA-003).
  rankLayout: {
    crownWidthBodyRatio: 0.44,
    badgeWidthBodyRatio: 0.27,
  },

  background: 'stage-bg-neon-kawaii',
  environment: {
    vipPodium: 'stage-vip-podium',
    // `VISUAL_CONTRACT.dj.productionArtwork = DEFERRED_TO_TASK_11`: STAGE keeps a neutral
    // primitive placeholder on the dj layer and must not treat it as a final asset.
  },

  costumePools: {
    regular: REGULAR_POOL,
    vip: VIP_POOL,
  },

  avatarFallback: 'avatar-default-happy',

  /**
   * Rank bands, exactly as `VISUAL_CONTRACT.rankVisual` specifies for R2:
   * Top 1/2/3 = rank-badge-01/02/03 + crown-gold/blue/pink; Top 4–10 = badge only.
   */
  rankTiers: [
    {
      fromRank: 1,
      toRank: 1,
      badge: 'rank-badge-01',
      accessory: 'crown-gold',
      aura: 'gold',
      costumePool: 'vip',
    },
    {
      fromRank: 2,
      toRank: 2,
      badge: 'rank-badge-02',
      accessory: 'crown-blue',
      aura: 'silver',
      costumePool: 'vip',
    },
    {
      fromRank: 3,
      toRank: 3,
      badge: 'rank-badge-03',
      accessory: 'crown-pink',
      aura: 'bronze',
      costumePool: 'vip',
    },
    { fromRank: 4, toRank: 4, badge: 'rank-badge-04', aura: 'violet', costumePool: 'vip' },
    { fromRank: 5, toRank: 5, badge: 'rank-badge-05', aura: 'violet', costumePool: 'vip' },
    { fromRank: 6, toRank: 6, badge: 'rank-badge-06', aura: 'violet', costumePool: 'vip' },
    { fromRank: 7, toRank: 7, badge: 'rank-badge-07', aura: 'violet', costumePool: 'vip' },
    { fromRank: 8, toRank: 8, badge: 'rank-badge-08', aura: 'violet', costumePool: 'vip' },
    { fromRank: 9, toRank: 9, badge: 'rank-badge-09', aura: 'violet', costumePool: 'vip' },
    { fromRank: 10, toRank: 10, badge: 'rank-badge-10', aura: 'violet', costumePool: 'vip' },
  ],

  /**
   * Gift tiers keyed by the ENGINE's tier id, so the renderer never re-derives a tier from a
   * diamond amount (Blueprint §26). `effectPreset` mirrors the engine config name.
   */
  giftTiers: [
    {
      tierId: 'tier-1',
      effectPreset: 'spark',
      asset: 'fx-tier1-spark',
      variants: ['fx-tier1-music'],
      durationMs: 1000,
      visualWeight: 1,
    },
    {
      tierId: 'tier-2',
      effectPreset: 'hearts',
      asset: 'fx-tier2-heart-rain',
      variants: ['fx-tier2-heart-orbit', 'fx-tier2-confetti'],
      durationMs: 1800,
      visualWeight: 2,
    },
    {
      tierId: 'tier-3',
      effectPreset: 'stars',
      asset: 'fx-tier3-crystal-rainbow',
      variants: ['fx-tier3-crystal-blue', 'fx-tier3-crystal-pink', 'fx-tier3-confetti-burst'],
      durationMs: 2500,
      visualWeight: 3,
    },
    {
      tierId: 'tier-4',
      effectPreset: 'aurora',
      asset: 'fx-tier4-crystal-crown',
      variants: ['fx-tier4-heart-podium', 'fx-tier4-heart-vortex', 'fx-tier4-star-vortex'],
      durationMs: 3600,
      visualWeight: 4,
    },
    {
      tierId: 'tier-5',
      effectPreset: 'mega-cosmic',
      asset: 'fx-tier5-cosmic-purple',
      variants: ['fx-tier5-cosmic-blue', 'fx-tier5-rainbow-vortex'],
      durationMs: 5200,
      visualWeight: 5,
    },
  ],

  /** Keyed by the engine's `GameCommand` / feed intent, not by artwork filename. */
  commandBubbles: {
    JOIN_STAGE: 'bubble-go',
    MOVE_VIP: 'bubble-vip',
    join: 'bubble-join',
    vao: 'bubble-vao',
    dance: 'bubble-dance',
    'thank-you': 'bubble-thank-you',
    'party-goal': 'bubble-party-goal',
    follow: 'bubble-follow',
    share: 'bubble-share',
    wow: 'bubble-wow',
    gg: 'bubble-gg',
    nice: 'bubble-nice',
    combo: 'bubble-combo',
    'support-me': 'bubble-support-me',
  },

  /** Contract slots `face-happy/love/wow/fire/dance` mapped onto approved R1 reaction ids. */
  reactions: {
    happy: 'reaction-happy',
    love: 'reaction-heart-eyes',
    wow: 'reaction-wow',
    fire: 'reaction-fire-angry',
    dance: 'reaction-party',
    cheer: 'reaction-cheer',
    cry: 'reaction-cry',
    gg: 'reaction-gg',
    excited: 'reaction-excited',
    shy: 'reaction-shy',
  },

  ui: {
    partyGoalFrame: 'party-goal-frame',
    newVip: 'ui-new-vip',
    top1Banner: 'ui-top1-banner',
    nowPlaying: 'ui-now-playing',
  },

  palette: {
    stageBase: '#090B18',
    stageRaised: '#13172D',
    cyan: '#40E9FF',
    magenta: '#FF4FD8',
    violet: '#8C63FF',
    gold: '#FFD75A',
    silver: '#D7E5F4',
    bronze: '#E8A16A',
    success: '#71F5A6',
    white: '#FFFFFF',
  },

  zones: {
    normal: { yMin: 0.48, yMax: 0.91 },
    vip: { yMin: 0.23, yMax: 0.48 },
    dj: { yMin: 0.08, yMax: 0.28 },
  },
};
