/**
 * Auto Host visuals on STAGE (Task 10 §8).
 *
 * These run against the REAL locked DA-VISUAL-R3 theme, so a semantic variant that no longer
 * resolves to approved artwork fails here instead of degrading silently at runtime.
 */

import { DEFAULT_PERFORMANCE_PROFILES, type StageEvent } from '@dance-arena/contracts';
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

function setup(): Harness {
  let now = 1_000;
  const renderer = createFakeRenderer();

  const scene = createStageScene({
    renderer,
    layout: createDefaultSlotLayout(),
    theme,
    profile: DEFAULT_PERFORMANCE_PROFILES.BALANCED,
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

let overlayCounter = 0;

function reaction(variant: string, overrides: Record<string, unknown> = {}): StageEvent {
  overlayCounter += 1;
  return {
    type: 'stage:host-reaction',
    at: 1_000,
    overlayId: `overlay-${overlayCounter}`,
    ruleId: 'test-rule',
    variant,
    durationMs: 2_000,
    ...overrides,
  } as StageEvent;
}

function bubble(variant: string, overrides: Record<string, unknown> = {}): StageEvent {
  overlayCounter += 1;
  return {
    type: 'stage:host-bubble',
    at: 1_000,
    overlayId: `overlay-${overlayCounter}`,
    ruleId: 'test-rule',
    variant,
    durationMs: 2_000,
    ...overrides,
  } as StageEvent;
}

function hostEffect(slot: string): StageEvent {
  overlayCounter += 1;
  return {
    type: 'stage:host-effect',
    at: 1_000,
    overlayId: `overlay-${overlayCounter}`,
    ruleId: 'test-rule',
    slot,
    durationMs: 3_000,
  } as StageEvent;
}

describe('semantic resolution against DA-VISUAL-R3', () => {
  it('resolves every Auto Host reaction variant to approved artwork', () => {
    const harness = setup();

    for (const variant of ['happy', 'love', 'wow', 'fire', 'party', 'cheer', 'gg']) {
      harness.scene.applyEvent(reaction(variant));
      harness.advance(2_500);
    }

    expect(harness.scene.unresolvedHostSlots).toEqual([]);
    for (const overlay of harness.renderer.hostOverlays) {
      expect(overlay.visual.asset).toBeDefined();
    }
  });

  it('resolves every Auto Host bubble variant to approved artwork', () => {
    const harness = setup();

    for (const variant of ['go', 'join', 'vip', 'thank-you', 'party-goal', 'follow', 'share']) {
      harness.scene.applyEvent(bubble(variant));
      harness.advance(2_500);
    }

    expect(harness.scene.unresolvedHostSlots).toEqual([]);
    for (const overlay of harness.renderer.hostOverlays) {
      expect(overlay.visual.asset).toBeDefined();
    }
  });

  it('resolves every host effect slot to approved artwork', () => {
    const harness = setup();

    for (const slot of ['celebration', 'party', 'sparkle']) {
      harness.scene.applyEvent(hostEffect(slot));
      harness.advance(3_500);
    }

    expect(harness.scene.unresolvedHostSlots).toEqual([]);
  });

  it('binds `go` to the same approved asset the JOIN_STAGE command bubble uses', () => {
    const harness = setup();

    harness.scene.applyEvent(bubble('go'));

    expect(harness.renderer.hostOverlays[0]?.visual.asset?.id).toBe(
      theme.commandBubbles.JOIN_STAGE?.id,
    );
  });

  it('degrades visibly when the theme does not bind the slot', () => {
    const harness = setup();

    harness.scene.applyEvent(reaction('not-a-real-variant'));

    expect(harness.renderer.hostOverlays[0]?.visual.asset).toBeUndefined();
    expect(harness.scene.unresolvedHostSlots).toEqual(['reaction.not-a-real-variant']);
  });
});

describe('lifetime and leaks', () => {
  it('retires an overlay when its duration elapsed', () => {
    const harness = setup();

    harness.scene.applyEvent(reaction('happy'));
    expect(harness.scene.hostOverlayCount).toBe(1);

    harness.advance(1_000);
    expect(harness.scene.hostOverlayCount).toBe(1);

    harness.advance(1_500);
    expect(harness.scene.hostOverlayCount).toBe(0);
    expect(harness.renderer.visibleHostOverlays()).toEqual([]);
  });

  it('caps concurrent overlays so a burst cannot grow the display list', () => {
    const harness = setup();

    for (let index = 0; index < 50; index += 1) harness.scene.applyEvent(reaction('happy'));

    expect(harness.scene.hostOverlayCount).toBeLessThanOrEqual(6);
    expect(harness.renderer.visibleHostOverlays().length).toBeLessThanOrEqual(6);

    // Every overlay that was pushed out was explicitly hidden — none leaked.
    const hidden = harness.renderer.hostOverlays.filter((overlay) => overlay.hidden).length;
    expect(hidden).toBe(50 - harness.renderer.visibleHostOverlays().length);
  });

  it('retires the OLDEST overlay when the cap is reached', () => {
    const harness = setup();

    const ids: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const event = reaction('happy', { durationMs: 1_000 + index * 100 });
      ids.push(event.type === 'stage:host-reaction' ? event.overlayId : '');
      harness.scene.applyEvent(event);
    }

    const visible = harness.renderer.visibleHostOverlays().map((overlay) => overlay.overlayId);
    expect(visible).toEqual(ids.slice(2));
  });

  it('clears every overlay on a snapshot rebuild (STAGE reload)', () => {
    const harness = setup();

    harness.scene.applyEvent(reaction('happy'));
    harness.scene.applyEvent(bubble('go'));
    expect(harness.scene.hostOverlayCount).toBe(2);

    harness.scene.applySnapshot({
      version: 1,
      generatedAt: 2_000,
      sessionId: 'session-1',
      dancers: [],
      ranking: [],
      partyGoal: { enabled: true, current: 0, target: 1_000, completedCount: 0 },
    });

    expect(harness.scene.hostOverlayCount).toBe(0);
    expect(harness.renderer.visibleHostOverlays()).toEqual([]);
  });
});

describe('anchoring', () => {
  it('anchors an overlay to the viewer dancer when they are on stage', () => {
    const harness = setup();
    const dancer = makeStageDancer('dancer-1', { userId: 'viewer-1', slotId: 'normal-05' });

    harness.scene.applyEvent({ type: 'stage:dancer-spawn', at: 1_000, dancer });
    harness.scene.applyEvent(bubble('go', { userId: 'viewer-1' }));

    const overlay = harness.renderer.hostOverlays[0];
    expect(overlay?.visual.anchor).toEqual(harness.scene.positionOf('dancer-1'));
  });

  it('falls back to a stage-level anchor when the viewer has no dancer', () => {
    const harness = setup();

    harness.scene.applyEvent(bubble('go', { userId: 'viewer-absent' }));

    expect(harness.renderer.hostOverlays[0]?.visual.anchor).toEqual({ x: 0.5, y: 0.3 });
  });
});

describe('separation from gift effects', () => {
  it('does not enter the gift effect budget', () => {
    const harness = setup();

    harness.scene.applyEvent(hostEffect('celebration'));

    expect(harness.renderer.effects).toEqual([]);
    expect(harness.scene.effects.stats.active).toBe(0);
    expect(harness.scene.effects.stats.queued).toBe(0);
    expect(harness.renderer.hostOverlays).toHaveLength(1);
  });

  it('carries no diamonds, tier or score anywhere in the payload', () => {
    const harness = setup();

    harness.scene.applyEvent(hostEffect('celebration'));
    const serialized = JSON.stringify(harness.renderer.hostOverlays[0]?.visual);

    for (const forbidden of ['diamonds', 'tierId', 'effectPreset', 'priority']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
