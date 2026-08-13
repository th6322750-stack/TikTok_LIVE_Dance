/**
 * Task 10 — Auto Host end-to-end.
 *
 * Drives the REAL composition root, exactly like the Task 08 slice:
 *
 *   Simulator → MockConnector → Normalizer → Core Engine → host trigger
 *     → AutoHostRuleEngine → intents → STAGE events / Main TTS queue → STAGE speech device
 *
 * Nothing here injects a trigger by hand and nothing pokes STAGE directly: every scenario starts
 * at the connector boundary, which is what makes these tests able to catch a broken transition.
 */

import type { AutoHostConfig, StageEvent } from '@dance-arena/contracts';
import { createDefaultAutoHostConfig } from '@dance-arena/core-engine';
import { describe, expect, it } from 'vitest';

import { createRuntimeHarness, type RuntimeHarness } from './testing/harness.js';

/** A ready runtime with a connected mock connector and a STAGE that can speak. */
async function connectedHarness(
  options: { autoHostConfig?: AutoHostConfig; speechAvailable?: boolean } = {},
): Promise<RuntimeHarness> {
  const harness = createRuntimeHarness(
    options.autoHostConfig === undefined ? {} : { autoHostConfig: options.autoHostConfig },
  );

  await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
  if (options.speechAvailable !== false) await harness.reportTtsAvailability(true);

  return harness;
}

const hostEvents = (harness: RuntimeHarness): StageEvent[] =>
  harness.stageEvents.filter((event) => event.type.startsWith('stage:host-'));

const announcements = (harness: RuntimeHarness): string[] =>
  harness.stageEvents
    .filter((event) => event.type === 'stage:announcement')
    .map((event) => (event.type === 'stage:announcement' ? event.text : ''));

/** Lets the TTS queue's promise chain settle after an event entered the pipeline. */
async function settle(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

describe('scenario 1 — follow', () => {
  it('turns a simulated follow into an announcement and a queued utterance', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'follow',
      userId: 'viewer-1',
      nickname: 'Mai Anh',
    });
    await settle();

    expect(announcements(harness).some((text) => text.includes('Mai Anh'))).toBe(true);
    expect(harness.ttsRequests).toHaveLength(1);
    expect(harness.ttsRequests[0]?.text).toContain('Mai Anh');
    expect(harness.ttsRequests[0]?.lang).toBe('vi-VN');
  });

  it('respects the per-user cooldown across repeated follows', async () => {
    const harness = await connectedHarness();

    for (let index = 0; index < 5; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'follow',
        userId: 'viewer-1',
      });
    }
    await settle();

    expect(harness.ttsRequests).toHaveLength(1);
  });
});

describe('scenario 2 — high-value gift', () => {
  it('credits the gift exactly once and thanks the sender without a second score', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'whale-1',
      nickname: 'Tùng',
      diamonds: 500,
    });
    await settle();

    // GiftEngine credited it once.
    const user = harness.runtime.engine.getState().users['whale-1'];
    expect(user?.totalDiamonds).toBe(500);
    expect(user?.giftCount).toBe(1);

    // Exactly one gift effect — the Auto Host did not add a second.
    const giftEffects = harness.stageEvents.filter((event) => event.type === 'stage:gift-effect');
    expect(giftEffects).toHaveLength(1);

    // …and no host EFFECT overlay was produced for the gift either.
    expect(hostEvents(harness).filter((event) => event.type === 'stage:host-effect')).toHaveLength(
      0,
    );

    // The host still thanked the sender.
    expect(harness.ttsRequests.some((request) => request.text.includes('Tùng'))).toBe(true);
  });

  it('never lets Auto Host change the score, ranking, queue or VIP state', async () => {
    const before = createRuntimeHarness();
    await before.runtime.handleControlInvoke('connector:connect', { target: '@sim' });

    const harness = await connectedHarness();
    for (const target of [before, harness]) {
      await target.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'gift',
        userId: 'whale-1',
        diamonds: 500,
      });
    }
    await settle();

    const withoutSpeech = before.runtime.engine.getState();
    const withHost = harness.runtime.engine.getState();

    expect(withHost.users['whale-1']?.totalDiamonds).toBe(
      withoutSpeech.users['whale-1']?.totalDiamonds,
    );
    expect(withHost.ranking.entries).toEqual(withoutSpeech.ranking.entries);
    expect(withHost.vip.userIds).toEqual(withoutSpeech.vip.userIds);
    expect(withHost.queue).toEqual(withoutSpeech.queue);
  });
});

describe('scenario 3 — replayed duplicate gift', () => {
  it('produces no second thank-you for a repeated cumulative streak frame', async () => {
    const harness = await connectedHarness();

    const emitStreak = async (repeatCount: number): Promise<void> => {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'gift',
        userId: 'viewer-2',
        diamonds: 500,
        repeatCount,
        streak: true,
        streakEnded: false,
      });
    };

    await emitStreak(1);
    await settle();
    const afterFirst = harness.ttsRequests.length + harness.runtime.autoHost.tts.pendingCount;

    // The provider re-sends the SAME cumulative frame: no new diamonds, so no new thanks.
    await emitStreak(1);
    await settle();

    expect(harness.ttsRequests.length + harness.runtime.autoHost.tts.pendingCount).toBe(afterFirst);
    expect(harness.runtime.engine.getState().users['viewer-2']?.totalDiamonds).toBe(500);
  });
});

/** The shipped preset with the follow rule's anti-spam removed, to pressure the queue itself. */
function withUncooledFollowRule(): AutoHostConfig {
  const config = createDefaultAutoHostConfig();

  return {
    ...config,
    rules: config.rules.map((rule) =>
      rule.ruleId === 'follow-thanks' ? { ...rule, cooldown: { globalMs: 0 } } : rule,
    ),
  };
}

describe('scenario 4 — social burst', () => {
  it('collapses a 120-event burst through the rule cooldowns', async () => {
    const harness = await connectedHarness();

    for (let index = 0; index < 120; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'follow',
        userId: `viewer-${index}`,
      });
    }
    await settle();

    // The rule cooldown is the FIRST line of defence: 120 follows in the same instant produce one
    // thank-you, so the queue is never even asked to absorb the burst.
    const policy = harness.runtime.autoHost.getState().config.queue;
    expect(harness.runtime.autoHost.tts.pendingCount).toBeLessThanOrEqual(policy.maxQueued);
    expect(harness.runtime.autoHost.tts.getMetrics().enqueued).toBe(1);
  });

  it('keeps the queue bounded when the burst does reach it', async () => {
    const harness = await connectedHarness({ autoHostConfig: withUncooledFollowRule() });

    for (let index = 0; index < 120; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'follow',
        userId: `viewer-${index}`,
      });
    }
    await settle();

    const policy = harness.runtime.autoHost.getState().config.queue;
    expect(harness.runtime.autoHost.tts.pendingCount).toBeLessThanOrEqual(policy.maxQueued);
    expect(harness.runtime.autoHost.tts.getMetrics().dropped).toBeGreaterThan(0);
  });

  it('keeps STAGE host overlays proportional to matched rules, not to raw events', async () => {
    const harness = await connectedHarness();

    // 100 joins from ONE viewer: the per-user cooldown collapses them to a single bubble.
    for (let index = 0; index < 100; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'join',
        userId: 'viewer-1',
      });
    }
    await settle();

    expect(hostEvents(harness).filter((event) => event.type === 'stage:host-bubble')).toHaveLength(
      1,
    );
  });
});

describe('scenario 5 — party goal completion', () => {
  it('produces exactly one celebration', async () => {
    const harness = await connectedHarness();

    harness.runtime.engine.updateConfig({
      partyGoal: { enabled: true, target: 100, growthFactor: 2 },
    });

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-1',
      diamonds: 500,
    });
    await settle();

    const celebrations = hostEvents(harness).filter(
      (event) => event.type === 'stage:host-effect' || event.type === 'stage:host-bubble',
    );

    expect(celebrations.filter((event) => event.type === 'stage:host-effect')).toHaveLength(1);
    expect(
      announcements(harness).filter((text) => text.includes('PARTY GOAL HOÀN THÀNH')),
    ).toHaveLength(1);
  });
});

describe('scenario 6 — rank promotion', () => {
  it('produces one promotion reaction for a real promotion', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-1',
      diamonds: 25,
    });
    await settle();

    const reactions = hostEvents(harness).filter((event) => event.type === 'stage:host-reaction');
    expect(reactions).toHaveLength(1);
    expect(reactions[0]).toMatchObject({ ruleId: 'rank-promotion-top3', variant: 'cheer' });
  });

  it('produces no promotion visual when the ranking position does not change', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-1',
      diamonds: 25,
    });
    await settle();
    const afterFirst = hostEvents(harness).length;

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-1',
      diamonds: 25,
    });
    await settle();

    const promotionEvents = hostEvents(harness)
      .slice(afterFirst)
      .filter((event) => event.type === 'stage:host-reaction');
    expect(promotionEvents).toEqual([]);
  });
});

describe('scenario 7 — accepted GO command', () => {
  it('emits the semantic `go` bubble STAGE resolves through DA-VISUAL-R3', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    await settle();

    const bubbles = hostEvents(harness).filter((event) => event.type === 'stage:host-bubble');
    const go = bubbles.find(
      (event) => event.type === 'stage:host-bubble' && event.variant === 'go',
    );

    expect(go).toBeDefined();
    expect(go).toMatchObject({ ruleId: 'command-go-bubble', userId: 'viewer-1' });
    // A SEMANTIC variant travelled to STAGE — never an asset id or a file path.
    expect(JSON.stringify(go)).not.toContain('bubble-go');
    expect(JSON.stringify(go)).not.toContain('.webp');
  });

  it('emits no bubble for a rejected command', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    await settle();
    const afterFirst = hostEvents(harness).length;

    // The viewer is already dancing: the engine rejects the second GO.
    harness.advance(60_000);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    await settle();

    expect(hostEvents(harness).length).toBe(afterFirst);
  });
});

describe('scenario 8 — CONTROL reload', () => {
  it('does not reset Auto Host config, cooldowns or the TTS queue', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('autohost:update-config', {
      tts: { rate: 1.5 },
    });
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'follow',
      userId: 'viewer-1',
    });
    await settle();

    const before = harness.runtime.autoHost.getState();

    // A CONTROL reload is just another `control:ready` handshake.
    await harness.runtime.handleControlInvoke('control:ready', {});
    const after = harness.runtime.autoHost.getState();

    expect(after.config.tts.rate).toBe(1.5);
    expect(after.status.engine.matched).toBe(before.status.engine.matched);
    expect(after.status.metrics.enqueued).toBe(before.status.metrics.enqueued);

    // The cooldown survived, so the same viewer is still suppressed.
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'follow',
      userId: 'viewer-1',
    });
    await settle();

    expect(harness.ttsRequests).toHaveLength(1);
  });
});

describe('scenario 9 — STAGE reload', () => {
  it('interrupts the current utterance without resetting canonical Core state', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'follow',
      userId: 'viewer-2',
    });
    await settle();

    const dancersBefore = harness.runtime.engine.getState().dancers.length;
    expect(harness.ttsRequests).toHaveLength(1);

    await harness.runtime.handleControlInvoke('stage:reload', {});
    await settle();

    expect(harness.runtime.engine.getState().dancers).toHaveLength(dancersBefore);
    expect(harness.runtime.autoHost.tts.getMetrics().interrupted).toBe(1);

    // STAGE comes back and reports it can speak again; the retry is bounded, never a replay loop.
    await harness.reportTtsAvailability(true);
    harness.runtime.autoHost.tick(harness.clock.now());
    await settle();

    expect(harness.ttsRequests.length).toBeLessThanOrEqual(2);
    expect(harness.runtime.autoHost.tts.pendingCount).toBeLessThanOrEqual(1);
  });

  it('rebuilds STAGE from a snapshot after the reload', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });

    const { snapshot } = await harness.runtime.handleStageInvoke('stage:ready', {});

    expect(snapshot.dancers).toHaveLength(1);
    expect(snapshot.dancers[0]?.userId).toBe('viewer-1');
  });
});

describe('scenario 10 — Auto Host off', () => {
  it('leaves gameplay behaving exactly as before', async () => {
    const withHost = await connectedHarness();
    const withoutHost = await connectedHarness();
    await withoutHost.runtime.handleControlInvoke('autohost:set-enabled', { enabled: false });

    for (const harness of [withHost, withoutHost]) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'comment-go',
        userId: 'viewer-1',
      });
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'gift',
        userId: 'viewer-1',
        diamonds: 500,
      });
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'follow',
        userId: 'viewer-2',
      });
    }
    await settle();

    const a = withHost.runtime.engine.getState();
    const b = withoutHost.runtime.engine.getState();

    expect(b.dancers.map((dancer) => dancer.userId)).toEqual(a.dancers.map((d) => d.userId));
    expect(b.ranking.entries).toEqual(a.ranking.entries);
    expect(b.counters).toEqual(a.counters);
    expect(b.partyGoal).toEqual(a.partyGoal);

    // …and the host itself produced nothing at all.
    expect(hostEvents(withoutHost)).toEqual([]);
    expect(withoutHost.ttsRequests).toEqual([]);
  });
});

describe('speech device availability', () => {
  it('keeps every visual working when Web Speech is missing', async () => {
    const harness = await connectedHarness({ speechAvailable: false });
    await harness.reportTtsAvailability(false, 'speechSynthesis is not available');

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'follow',
      userId: 'viewer-1',
      nickname: 'Mai',
    });
    await settle();

    expect(announcements(harness).some((text) => text.includes('Mai'))).toBe(true);
    expect(hostEvents(harness).length).toBeGreaterThan(0);

    // The utterance was answered `unavailable` and dropped — the queue did not stall.
    expect(harness.runtime.autoHost.tts.getMetrics().unavailable).toBeGreaterThan(0);
    expect(harness.runtime.autoHost.tts.pendingCount).toBe(0);

    const status = harness.runtime.autoHost.getState().status;
    expect(status.ttsAvailable).toBe(false);
    expect(status.ttsUnavailableReason).toContain('speechSynthesis');
  });
});

describe('session lifecycle', () => {
  /** Queues real work: the STAGE fake never acknowledges, so items pile up behind the first. */
  async function queueThreeThanks(harness: RuntimeHarness): Promise<void> {
    for (let index = 0; index < 3; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'follow',
        userId: `viewer-${index}`,
      });
      // Past the follow rule's global cooldown, so each viewer really does get a thank-you.
      harness.advance(5_000);
    }
    await settle();
  }

  it('clears pending speech on a session reset so old thanks are never spoken later', async () => {
    const harness = await connectedHarness();

    await queueThreeThanks(harness);
    expect(harness.runtime.autoHost.tts.pendingCount).toBeGreaterThan(0);

    await harness.runtime.handleControlInvoke('game:command', { type: 'game:reset-session' });

    expect(harness.runtime.autoHost.tts.pendingCount).toBe(0);
    expect(harness.runtime.autoHost.getState().status.engine.matched).toBe(0);
  });

  it('clears pending speech on an operator disconnect', async () => {
    const harness = await connectedHarness();

    await queueThreeThanks(harness);
    expect(harness.runtime.autoHost.tts.pendingCount).toBeGreaterThan(0);

    await harness.runtime.handleControlInvoke('connector:disconnect', {});

    expect(harness.runtime.autoHost.tts.pendingCount).toBe(0);
  });
});

describe('reminder timer (Main-owned)', () => {
  it('fires a typed timer:reminder trigger while the session is connected', async () => {
    const config: AutoHostConfig = { ...createDefaultAutoHostConfig(), reminderIntervalMs: 5_000 };
    const harness = await connectedHarness({ autoHostConfig: config });
    harness.runtime.start();

    harness.advance(5_100);
    await settle();

    expect(announcements(harness).some((text) => text.includes('GO'))).toBe(true);
  });

  it('does not fire while the connector is idle', async () => {
    const config: AutoHostConfig = { ...createDefaultAutoHostConfig(), reminderIntervalMs: 5_000 };
    const harness = createRuntimeHarness({ autoHostConfig: config });
    harness.runtime.start();

    harness.advance(5_100);
    await settle();

    expect(announcements(harness)).toEqual([]);
  });
});

describe('CONTROL runtime configuration', () => {
  it('answers every mutation with the state Main kept', async () => {
    const harness = await connectedHarness();

    const disabled = await harness.runtime.handleControlInvoke('autohost:set-enabled', {
      enabled: false,
    });
    expect(disabled.config.enabled).toBe(false);

    const enabled = await harness.runtime.handleControlInvoke('autohost:set-enabled', {
      enabled: true,
    });
    expect(enabled.config.enabled).toBe(true);
  });

  it('applies a bounded rule edit without touching conditions or actions', async () => {
    const harness = await connectedHarness();

    const state = await harness.runtime.handleControlInvoke('autohost:update-rule', {
      ruleId: 'follow-thanks',
      cooldown: { globalMs: 12_345 },
      templates: { tts: 'Xin cảm ơn {user.nickname}' },
      ttsPriority: 'high',
    });

    const rule = state.config.rules.find((candidate) => candidate.ruleId === 'follow-thanks');
    expect(rule?.cooldown.globalMs).toBe(12_345);

    const tts = rule?.actions.find((action) => action.type === 'TTS');
    expect(tts).toMatchObject({ template: 'Xin cảm ơn {user.nickname}', priority: 'high' });

    // The action list itself is unchanged in shape.
    expect(rule?.actions.map((action) => action.type)).toEqual([
      'SHOW_ANNOUNCEMENT',
      'SHOW_BUBBLE',
      'TTS',
    ]);
  });

  it('rejects a configuration patch that would break the contract', async () => {
    const harness = await connectedHarness();
    const before = harness.runtime.autoHost.getState().config.tts.rate;

    // `rate` is bounded to 0.5–2 by the contract; the merged document fails validation and the
    // previous configuration is kept.
    await harness.runtime.handleControlInvoke('autohost:update-config', { tts: { rate: 99 } });

    expect(harness.runtime.autoHost.getState().config.tts.rate).toBe(before);
  });

  it('speaks a test phrase on demand', async () => {
    const harness = await connectedHarness();

    const result = await harness.runtime.handleControlInvoke('autohost:test-tts', {});
    await settle();

    expect(result.ok).toBe(true);
    expect(harness.ttsRequests).toHaveLength(1);
  });

  it('clears the queue on demand', async () => {
    const harness = await connectedHarness();

    for (let index = 0; index < 5; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'follow',
        userId: `viewer-${index}`,
      });
    }
    await settle();

    await harness.runtime.handleControlInvoke('autohost:clear-tts-queue', {});

    expect(harness.runtime.autoHost.tts.pendingCount).toBe(0);
  });

  it('publishes a throttled status to CONTROL', async () => {
    const harness = await connectedHarness();
    harness.runtime.start();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'follow',
      userId: 'viewer-1',
    });
    await settle();

    harness.advance(1_000);
    expect(harness.autoHostStatuses.length).toBeGreaterThan(0);

    const latest = harness.autoHostStatuses[harness.autoHostStatuses.length - 1];
    expect(latest?.enabled).toBe(true);
    expect(latest?.recentActions.length).toBeGreaterThan(0);
  });
});
