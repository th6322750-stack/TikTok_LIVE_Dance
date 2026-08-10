import type { StageSnapshot } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { createDefaultSlotLayout } from './slotLayout.js';
import { createStageScene } from './stageScene.js';
import { createFakeRenderer, makeStageDancer } from './testing/fakeRenderer.js';

function setup() {
  const renderer = createFakeRenderer();
  const scene = createStageScene({ renderer, layout: createDefaultSlotLayout() });
  return { renderer, scene };
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

describe('snapshot handling (Blueprint §29)', () => {
  it('builds the exact dancer count from a snapshot', () => {
    const { renderer, scene } = setup();

    scene.applySnapshot(snapshotWith(10));

    expect(scene.dancerCount).toBe(10);
    expect(renderer.liveDancers()).toHaveLength(10);
    expect(renderer.ranking).toHaveLength(1);
    expect(renderer.partyGoal?.target).toBe(1_000);
  });

  it('rebuilds the scene on reload without leaking the previous dancers', () => {
    const { renderer, scene } = setup();

    scene.applySnapshot(snapshotWith(10));
    scene.applySnapshot(snapshotWith(3));

    expect(scene.dancerCount).toBe(3);
    expect(renderer.liveDancers()).toHaveLength(3);
    expect(renderer.created.filter((record) => record.destroyed)).toHaveLength(10);
    expect(renderer.clears).toBe(2);
  });

  it('restores a mid-session scene after a STAGE reload', () => {
    const { scene } = setup();

    // Session runs, then STAGE reloads and receives a fresh snapshot from Main.
    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });
    scene.applyEvent({ type: 'stage:dancer-spawn', at: 2, dancer: makeStageDancer('d2') });

    const restored = snapshotWith(2);
    scene.applySnapshot(restored);

    expect(scene.dancerCount).toBe(2);
    expect(scene.hasDancer('d1')).toBe(true);
    expect(scene.hasDancer('d2')).toBe(true);
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
    expect(renderer.liveDancers()).toHaveLength(0);
  });

  it('ignores a remove for an unknown dancer', () => {
    const { scene } = setup();

    scene.applyEvent({ type: 'stage:dancer-remove', at: 1, dancerId: 'ghost', reason: 'left' });

    expect(scene.dancerCount).toBe(0);
  });

  it('patches a move instead of rebuilding the scene', () => {
    const { renderer, scene } = setup();
    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });

    scene.applyEvent({
      type: 'stage:dancer-move',
      at: 2,
      dancerId: 'd1',
      slotId: 'vip-01',
      zone: 'vip',
      position: { x: 0.1, y: 0.3 },
    });

    expect(renderer.created).toHaveLength(1);
    expect(renderer.clears).toBe(0);
    expect(renderer.created[0]?.moves).toBe(1);
  });

  it('applies rank badges from the ranking event only', () => {
    const { renderer, scene } = setup();
    scene.applyEvent({ type: 'stage:dancer-spawn', at: 1, dancer: makeStageDancer('d1') });

    expect(renderer.created[0]?.rank).toBeUndefined();

    scene.applyEvent({
      type: 'stage:ranking-change',
      at: 2,
      entries: [{ rank: 1, userId: 'user-d1', nickname: 'Dancer d1', totalDiamonds: 900 }],
      promoted: ['user-d1'],
      demoted: [],
    });

    expect(renderer.created[0]?.rank).toBe(1);
    expect(renderer.ranking).toHaveLength(1);
  });

  it('renders a resolved gift effect without recomputing the tier', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({
      type: 'stage:gift-effect',
      at: 1,
      userId: 'u1',
      giftName: 'Universe',
      diamonds: 1_500,
      tierId: 'tier-5',
      effectPreset: 'mega-cosmic',
      durationMs: 8_000,
      priority: 5,
    });

    expect(renderer.giftEffects).toHaveLength(1);
    expect(renderer.giftEffects[0]?.tierId).toBe('tier-5');
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

  it('places VIP slots above normal slots', () => {
    const layout = createDefaultSlotLayout();

    const vip = layout.positionOf('vip-01', { x: 0, y: 0 });
    const normal = layout.positionOf('normal-01', { x: 0, y: 0 });

    expect(vip.y).toBeLessThan(normal.y);
  });

  it('falls back to the engine position for an unknown slot id', () => {
    const layout = createDefaultSlotLayout();

    expect(layout.has('mystery-99')).toBe(false);
    expect(layout.positionOf('mystery-99', { x: 0.42, y: 0.77 })).toEqual({ x: 0.42, y: 0.77 });
  });

  it('uses the layout position, not the engine position, for a known slot', () => {
    const { renderer, scene } = setup();

    scene.applyEvent({
      type: 'stage:dancer-spawn',
      at: 1,
      dancer: makeStageDancer('d1', { slotId: 'normal-01', position: { x: 0.99, y: 0.99 } }),
    });

    expect(renderer.created[0]?.position).not.toEqual({ x: 0.99, y: 0.99 });
  });
});
