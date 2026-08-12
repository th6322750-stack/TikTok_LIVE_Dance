import {
  DEFAULT_PERFORMANCE_PROFILES,
  type StageEventOf,
  type StageSnapshot,
} from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { createDefaultSlotLayout } from './slotLayout.js';
import { createStageScene, type StageScene } from './stageScene.js';
import { createFakeRenderer, makeStageDancer, type FakeRenderer } from './testing/fakeRenderer.js';
import { loadLockedTheme } from './testing/themeFixture.js';

const { theme } = loadLockedTheme();

interface Harness {
  renderer: FakeRenderer;
  scene: StageScene;
  advance(ms: number): void;
}

function setup(mode: 'LOW' | 'BALANCED' | 'ULTRA' = 'BALANCED'): Harness {
  let now = 1_000;
  const renderer = createFakeRenderer();

  const scene = createStageScene({
    renderer,
    layout: createDefaultSlotLayout(),
    theme,
    profile: DEFAULT_PERFORMANCE_PROFILES[mode],
    now: () => now,
  });

  return {
    renderer,
    scene,
    advance(ms: number): void {
      now += ms;
      scene.update();
    },
  };
}

function snapshotWith(dancerCount: number): StageSnapshot {
  return {
    version: 1,
    generatedAt: 1_000,
    sessionId: 'session-1',
    dancers: Array.from({ length: dancerCount }, (_unused, index) =>
      makeStageDancer(`d${index + 1}`, {
        slotId: `normal-${String(index + 1).padStart(2, '0')}`,
        userId: `u${index + 1}`,
      }),
    ),
    ranking: [{ rank: 1, userId: 'u1', nickname: 'Dancer d1', totalDiamonds: 500 }],
    partyGoal: { enabled: true, current: 100, target: 1_000, completedCount: 0 },
  };
}

type GiftEffectEvent = StageEventOf<'stage:gift-effect'>;

const giftEffect = (overrides: Partial<GiftEffectEvent> = {}): GiftEffectEvent => ({
  type: 'stage:gift-effect',
  at: 1_000,
  userId: 'u1',
  giftName: 'Rose',
  diamonds: 10,
  tierId: 'tier-1',
  effectPreset: 'spark',
  durationMs: 1_000,
  priority: 1,
  ...overrides,
});

describe('snapshot handling (Blueprint §29)', () => {
  it('builds the exact dancer count from a snapshot', () => {
    const { renderer, scene } = setup();

    scene.applySnapshot(snapshotWith(10));

    expect(scene.dancerCount).toBe(10);
    expect(renderer.liveDancers()).toHaveLength(10);
    expect(renderer.ranking).toHaveLength(1);
  });

  it('handles a full 30-dancer stage without leaking views', () => {
    const { renderer, scene } = setup('ULTRA');

    scene.applySnapshot(snapshotWith(30));
    expect(scene.dancerCount).toBe(30);
    expect(renderer.liveDancers()).toHaveLength(30);

    // Ten reload cycles must not accumulate live views.
    for (let cycle = 0; cycle < 10; cycle += 1) {
      scene.applySnapshot(snapshotWith(30));
    }

    expect(scene.dancerCount).toBe(30);
    expect(renderer.liveDancers()).toHaveLength(30);
    expect(renderer.created.filter((record) => record.destroyed)).toHaveLength(300);
  });

  it('restores a mid-session scene after a STAGE reload', () => {
    const { scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });
    scene.applySnapshot(snapshotWith(2));

    expect(scene.dancerCount).toBe(2);
    expect(scene.hasDancer('d1')).toBe(true);
  });
});

describe('approved artwork binding (Task 09)', () => {
  it('gives every dancer a body from the approved costume pool', () => {
    const { renderer, scene } = setup();

    scene.applySnapshot(snapshotWith(12));

    for (const record of renderer.liveDancers()) {
      expect(record.visual.body).toBeDefined();
      expect(record.visual.body?.category).toBe('body');
      expect(record.visual.body?.id).toMatch(/^dancer-regular-\d\d$/);
    }
  });

  it('takes the avatar socket from the body asset, not from a hard-coded constant', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });
    const record = renderer.recordFor('user-d1');
    const socket = record?.visual.headSocket;

    expect(socket).toBeDefined();
    // R2 measured each body individually, so the socket is NOT a centred default (DA-QA-001).
    expect(socket?.x).toBeGreaterThan(0.4);
    expect(socket?.x).toBeLessThan(0.6);
    expect(socket?.y).toBeGreaterThan(0.1);
    expect(socket?.y).toBeLessThan(0.7);
    expect(socket?.radius).toBeGreaterThan(0.05);

    // It must be the socket of the body that was actually bound to this dancer.
    expect(socket).toEqual(record?.visual.body?.headSocket);

    // Always offers the approved fallback head so a dead avatar url cannot leave a hole.
    expect(record?.visual.avatarFallback?.id).toBe('avatar-default-happy');
  });

  it('switches to a VIP body when the engine moves a dancer into the VIP zone', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });
    expect(renderer.recordFor('user-d1')?.visual.body?.category).toBe('body');

    scene.applyEvent({
      type: 'stage:dancer-move',
      at: 2,
      dancerId: 'd1',
      slotId: 'vip-01',
      zone: 'vip',
      position: { x: 0.1, y: 0.3 },
    });

    expect(renderer.recordFor('user-d1')?.visual.body?.category).toBe('vip-body');
  });

  it('keeps the same costume for a user across respawns', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });
    const first = renderer.recordFor('user-d1')?.visual.body?.id;

    scene.applyEvent({ type: 'stage:dancer-remove', at: 2, dancerId: 'd1', reason: 'left' });
    scene.applyEvent({
      type: 'stage:dancer-spawn',
      at: 3,
      dancer: makeStageDancer('d9', { userId: 'user-d1' }),
    });

    expect(renderer.recordFor('user-d1')?.visual.body?.id).toBe(first);
  });

  it('applies crown + badge + aura for the top three and badge only below', () => {
    const { renderer, scene } = setup();

    for (let index = 1; index <= 4; index += 1) {
      scene.applyEvent({
        type: 'stage:dancer-spawn',
        at: index,
        dancer: makeStageDancer(`d${index}`, {
          userId: `u${index}`,
          slotId: `normal-0${index}`,
        }),
      });
    }

    scene.applyEvent({
      type: 'stage:ranking-change',
      at: 10,
      entries: [1, 2, 3, 4].map((rank) => ({
        rank,
        userId: `u${rank}`,
        nickname: `U${rank}`,
        totalDiamonds: 1_000 - rank,
      })),
      promoted: [],
      demoted: [],
    });

    expect(renderer.recordFor('u1')?.visual.accessory?.id).toBe('crown-gold');
    expect(renderer.recordFor('u2')?.visual.accessory?.id).toBe('crown-blue');
    expect(renderer.recordFor('u3')?.visual.accessory?.id).toBe('crown-pink');
    expect(renderer.recordFor('u4')?.visual.accessory).toBeUndefined();

    expect(renderer.recordFor('u1')?.visual.badge?.id).toBe('rank-badge-01');
    expect(renderer.recordFor('u4')?.visual.badge?.id).toBe('rank-badge-04');

    // Aura colour comes from the theme palette, never a literal in renderer code.
    expect(renderer.recordFor('u1')?.visual.auraColor).toBe(theme.palette.gold);
  });

  it('hands the renderer the approved crown/badge ratios (DA-QA-003)', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });

    // Contract values, not renderer constants: crown 0.44x body, rank badge 0.27x body.
    expect(renderer.recordFor('user-d1')?.visual.rankLayout).toEqual({
      crownWidthBodyRatio: 0.44,
      badgeWidthBodyRatio: 0.27,
    });
  });

  it('binds each engine gift tier to its approved effect asset', () => {
    const { renderer, scene, advance } = setup('ULTRA');

    for (const [tierId, expected] of [
      ['tier-1', 'fx-tier1-spark'],
      ['tier-3', 'fx-tier3-crystal-rainbow'],
      ['tier-5', 'fx-tier5-cosmic-purple'],
    ]) {
      scene.applyEvent(giftEffect({ tierId, at: 1_000 + Number(tierId?.at(-1)) }));
      advance(6_000);

      expect(renderer.effects.at(-1)?.visual.asset?.id).toBe(expected);
    }
  });

  it('does not re-derive a tier from the diamond amount', () => {
    const { renderer, scene } = setup();

    // A tier-1 event carrying a huge diamond count must still render tier-1 artwork.
    scene.applyEvent(giftEffect({ tierId: 'tier-1', diamonds: 999_999 }));

    expect(renderer.effects[0]?.visual.asset?.id).toBe('fx-tier1-spark');
  });
});

describe('effect scheduler under gift spam (Task 09)', () => {
  it('caps concurrent effects at the performance budget', () => {
    const { renderer, scene } = setup('LOW');
    const budget = DEFAULT_PERFORMANCE_PROFILES.LOW.maxConcurrentEffects;

    for (let index = 0; index < 20; index += 1) {
      scene.applyEvent(giftEffect({ at: 1_000 + index, tierId: 'tier-1' }));
    }

    expect(renderer.playingEffects().length).toBeLessThanOrEqual(budget);
    expect(scene.effects.stats.dropped + scene.effects.stats.queued).toBeGreaterThan(0);
  });

  it('lets a heavier tier preempt the weakest playing effect', () => {
    const { renderer, scene } = setup('LOW');

    for (let index = 0; index < DEFAULT_PERFORMANCE_PROFILES.LOW.maxConcurrentEffects; index += 1) {
      scene.applyEvent(giftEffect({ at: 1_000 + index, tierId: 'tier-1' }));
    }
    expect(scene.effects.stats.preempted).toBe(0);

    scene.applyEvent(giftEffect({ at: 9_000, tierId: 'tier-5', userId: 'whale' }));

    expect(scene.effects.stats.preempted).toBe(1);
    expect(
      renderer.playingEffects().some((effect) => effect.visual.asset?.id.startsWith('fx-tier5')),
    ).toBe(true);
  });

  it('expires effects after their approved duration', () => {
    const { renderer, scene, advance } = setup('ULTRA');

    scene.applyEvent(giftEffect({ tierId: 'tier-1' }));
    expect(renderer.playingEffects()).toHaveLength(1);

    advance(1_500);

    expect(renderer.playingEffects()).toHaveLength(0);
  });

  it('promotes queued effects once capacity frees up', () => {
    const { renderer, scene, advance } = setup('LOW');
    const budget = DEFAULT_PERFORMANCE_PROFILES.LOW.maxConcurrentEffects;

    for (let index = 0; index < budget + 2; index += 1) {
      scene.applyEvent(giftEffect({ at: 1_000 + index, tierId: 'tier-2' }));
    }

    const playedBefore = renderer.effects.length;
    advance(3_000);

    expect(renderer.effects.length).toBeGreaterThan(playedBefore);
  });

  it('scales particles with the performance profile', () => {
    const low = setup('LOW');
    const ultra = setup('ULTRA');

    low.scene.applyEvent(giftEffect());
    ultra.scene.applyEvent(giftEffect());

    expect(low.renderer.effects[0]?.visual.particleScale).toBeLessThan(
      ultra.renderer.effects[0]?.visual.particleScale ?? 1,
    );
  });

  it('passes full takeover coverage for tier-4/tier-5 even in LOW mode (DA-QA-005)', () => {
    const low = setup('LOW');

    low.scene.applyEvent(giftEffect({ tierId: 'tier-4', at: 1_100 }));
    low.advance(6_000);
    low.scene.applyEvent(giftEffect({ tierId: 'tier-5', at: 9_000 }));

    const tier4 = low.renderer.effects.find((effect) => effect.event.tierId === 'tier-4');
    const tier5 = low.renderer.effects.find((effect) => effect.event.tierId === 'tier-5');

    expect(tier4?.visual.coverage).toBeGreaterThanOrEqual(0.82);
    expect(tier5?.visual.coverage).toBeGreaterThanOrEqual(1);
  });

  it('keeps small tiers under the LOW cap (DA-QA-005)', () => {
    const low = setup('LOW');

    low.scene.applyEvent(giftEffect({ tierId: 'tier-1' }));

    expect(low.renderer.effects[0]?.visual.coverage).toBeLessThanOrEqual(0.62);
  });
});

describe('theme switching (Task 09)', () => {
  it('rebinds artwork without changing gameplay state', () => {
    const { renderer, scene } = setup();

    scene.applySnapshot(snapshotWith(5));
    const before = {
      count: scene.dancerCount,
      ids: renderer.liveDancers().map((record) => record.dancer.dancerId),
      slots: renderer.liveDancers().map((record) => record.dancer.slotId),
      positions: renderer.liveDancers().map((record) => record.position),
    };

    // Same locked package, different performance profile + theme instance.
    scene.setTheme(theme, DEFAULT_PERFORMANCE_PROFILES.ULTRA);

    expect(scene.dancerCount).toBe(before.count);
    expect(renderer.liveDancers().map((record) => record.dancer.dancerId)).toEqual(before.ids);
    expect(renderer.liveDancers().map((record) => record.dancer.slotId)).toEqual(before.slots);
    expect(renderer.liveDancers().map((record) => record.position)).toEqual(before.positions);
    // No dancer was destroyed and recreated by the swap.
    expect(renderer.created.filter((record) => record.destroyed)).toHaveLength(0);
    expect(renderer.clears).toBe(1); // only the snapshot cleared
  });

  it('re-applies the theme to the renderer and updates the effect budget', () => {
    const { renderer, scene } = setup('LOW');

    expect(renderer.themeApplications).toHaveLength(1);

    scene.setTheme(theme, DEFAULT_PERFORMANCE_PROFILES.ULTRA);

    expect(renderer.themeApplications).toHaveLength(2);
    expect(scene.profile.mode).toBe('ULTRA');

    for (let index = 0; index < 10; index += 1) {
      scene.applyEvent(giftEffect({ at: 2_000 + index, tierId: 'tier-1' }));
    }

    expect(renderer.playingEffects().length).toBeGreaterThan(
      DEFAULT_PERFORMANCE_PROFILES.LOW.maxConcurrentEffects,
    );
  });

  it('stops surplus effects when the profile tightens', () => {
    const { scene } = setup('ULTRA');

    for (let index = 0; index < 8; index += 1) {
      scene.applyEvent(giftEffect({ at: 1_000 + index, tierId: 'tier-2' }));
    }

    scene.setPerformanceProfile(DEFAULT_PERFORMANCE_PROFILES.LOW);

    expect(scene.effects.stats.active).toBeLessThanOrEqual(
      DEFAULT_PERFORMANCE_PROFILES.LOW.maxConcurrentEffects,
    );
  });
});

describe('incremental events (Blueprint §30)', () => {
  it('spawns and removes without duplicating a dancer', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });
    scene.applyEvent({ type: 'stage:dancer-spawn', at: 2, dancer: makeStageDancer('d1') });

    expect(scene.dancerCount).toBe(1);
    expect(renderer.created).toHaveLength(1);

    scene.applyEvent({ type: 'stage:dancer-remove', at: 3, dancerId: 'd1', reason: 'left' });

    expect(scene.dancerCount).toBe(0);
  });

  it('patches a move instead of rebuilding the scene', () => {
    const { renderer, scene } = setup();
    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });

    scene.applyEvent({
      type: 'stage:dancer-move',
      at: 2,
      dancerId: 'd1',
      slotId: 'normal-02',
      zone: 'normal',
      position: { x: 0.2, y: 0.6 },
    });

    expect(renderer.created).toHaveLength(1);
    expect(renderer.clears).toBe(0);
    expect(renderer.created[0]?.moves).toBe(1);
  });

  it('ignores a remove for an unknown dancer', () => {
    const { scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-remove', at: 1, dancerId: 'ghost', reason: 'left' });

    expect(scene.dancerCount).toBe(0);
  });

  it('tracks spotlight, announcement and party goal events', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({ type: 'stage:spotlight-start', at: 1, userId: 'u1', durationMs: 5_000 });
    expect(renderer.spotlightUserId).toBe('u1');

    scene.applyEvent({ type: 'stage:spotlight-end', at: 2, userId: 'u1' });
    expect(renderer.spotlightUserId).toBeUndefined();

    scene.applyEvent({
      type: 'stage:announcement',
      at: 3,
      text: 'PARTY GOAL COMPLETED!',
      level: 'celebration',
      durationMs: 5_000,
    });
    expect(renderer.announcements).toEqual(['PARTY GOAL COMPLETED!']);

    scene.applyEvent({
      type: 'stage:party-goal',
      at: 4,
      state: { enabled: true, current: 0, target: 2_000, completedCount: 1 },
      completed: true,
    });
    expect(renderer.partyGoal?.completedCount).toBe(1);
  });
});

describe('slot layout (Blueprint §22)', () => {
  it('maps logical slots to normalized coordinates inside 0..1', () => {
    const layout = createDefaultSlotLayout();

    for (const slotId of ['normal-01', 'normal-30', 'vip-01', 'vip-10']) {
      const position = layout.positionOf(slotId, { x: 0, y: 0 });

      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThanOrEqual(1);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThanOrEqual(1);
    }
  });

  it('places VIP slots above normal slots, inside the contract zones', () => {
    const layout = createDefaultSlotLayout();

    const vip = layout.positionOf('vip-01', { x: 0, y: 0 });
    const normal = layout.positionOf('normal-01', { x: 0, y: 0 });

    expect(vip.y).toBeLessThan(normal.y);
    expect(vip.y).toBeGreaterThanOrEqual(theme.zones.vip.yMin);
    expect(normal.y).toBeGreaterThanOrEqual(theme.zones.normal.yMin);
  });

  it('falls back to the engine position for an unknown slot id', () => {
    const layout = createDefaultSlotLayout();

    expect(layout.has('mystery-99')).toBe(false);
    expect(layout.positionOf('mystery-99', { x: 0.42, y: 0.77 })).toEqual({ x: 0.42, y: 0.77 });
  });
});
