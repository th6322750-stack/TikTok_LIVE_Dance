import { ManualScheduler } from '@dance-arena/connectors';
import { describe, expect, it } from 'vitest';

import { GIFT_PRESETS, giftStreakPayloads } from './payloads.js';
import { scenarioToSession } from './recorder.js';
import { findScenario, SCENARIOS } from './scenarios.js';
import { createPipeline, createReplayPipeline } from './testing/pipeline.js';
import { simulatedUser } from './users.js';

describe('simulator pipeline (Blueprint §53)', () => {
  it('drives GO through connector → normalizer → engine', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    pipeline.simulator.emit({ preset: 'comment-go', userId: 'u1' });

    // The engine only ever saw a normalized contract event, never the mock payload.
    expect(pipeline.normalizedEvents).toHaveLength(1);
    expect(pipeline.normalizedEvents[0]).toMatchObject({
      version: 1,
      type: 'comment',
      normalizedComment: 'GO',
      user: { platformUserId: 'u1' },
    });
    expect(pipeline.engine.getState().dancers).toHaveLength(1);
  });

  it('emits nothing before the connector is connected', () => {
    const pipeline = createPipeline();

    pipeline.simulator.emit({ preset: 'comment-go', userId: 'u1' });

    expect(pipeline.normalizedEvents).toHaveLength(0);
    expect(pipeline.engine.getState().dancers).toHaveLength(0);
  });

  it('runs the GO → gift → follow sequence into the expected canonical state', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    pipeline.simulator.emit({ preset: 'comment-go', userId: 'u1', nickname: 'Dancer' });
    pipeline.advance(500);
    pipeline.simulator.emit({ preset: 'gift', userId: 'u1', diamonds: 500 });
    pipeline.advance(500);
    pipeline.simulator.emit({ preset: 'follow', userId: 'u1' });

    const state = pipeline.engine.getState();
    expect(state.dancers).toHaveLength(1);
    expect(state.users.u1?.totalDiamonds).toBe(500);
    expect(state.users.u1?.follow).toBe(true);
    expect(state.ranking.entries[0]?.userId).toBe('u1');
    expect(state.counters.totalDiamonds).toBe(500);
  });

  it('supports every emit preset', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    for (const preset of ['comment-go', 'gift', 'follow', 'share', 'join', 'like'] as const) {
      pipeline.advance(100);
      expect(pipeline.simulator.emit({ preset, userId: `u-${preset}` })).toBe(true);
    }

    const counters = pipeline.engine.getState().counters;
    expect(counters.commentCount).toBe(1);
    expect(counters.giftCount).toBe(1);
    expect(counters.followCount).toBe(1);
    expect(counters.shareCount).toBe(1);
    expect(counters.joinCount).toBe(1);
    expect(counters.likeCount).toBe(1);
  });

  it('generates deterministic users', () => {
    expect(simulatedUser(0)).toEqual(simulatedUser(0));
    expect(simulatedUser(0).userId).not.toBe(simulatedUser(1).userId);
    expect(simulatedUser(0).avatar).toContain('sim-user-001');
  });

  it('offers one gift preset per Blueprint §26 tier', () => {
    expect(GIFT_PRESETS.map((preset) => preset.diamonds)).toEqual([1, 25, 99, 500, 1500]);
  });
});

describe('scenarios', () => {
  it('exposes unique scenario ids', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('plays the join-and-gift scenario through the real pipeline', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    expect(pipeline.simulator.startScenario('join-and-gift')).toBe(true);
    pipeline.advance(5_000);

    const state = pipeline.engine.getState();
    expect(state.dancers).toHaveLength(2);
    expect(state.ranking.entries[0]?.userId).toBe(simulatedUser(1).userId);
    expect(state.counters.totalDiamonds).toBe(599);
  });

  it('rejects an unknown scenario id', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    expect(pipeline.simulator.startScenario('does-not-exist')).toBe(false);
  });

  it('stops a running scenario without emitting the remaining steps', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    pipeline.simulator.startScenario('crowd');
    pipeline.advance(500);
    const emittedBefore = pipeline.normalizedEvents.length;

    pipeline.simulator.stop();
    pipeline.advance(10_000);

    expect(pipeline.normalizedEvents.length).toBe(emittedBefore);
  });

  it('fills 30 slots and queues the overflow in the crowd scenario', async () => {
    const pipeline = createPipeline({ cooldowns: { join: 0 } });
    await pipeline.connect();

    pipeline.simulator.startScenario('crowd');
    pipeline.advance(10_000);

    const state = pipeline.engine.getState();
    expect(state.dancers).toHaveLength(30);
    expect(state.queue).toHaveLength(5);
  });
});

describe('gift streak through the pipeline (Blueprint §13)', () => {
  it('credits a x4 combo as 4 repeats, not 1+2+3+4', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    const user = simulatedUser(0);
    for (const payload of giftStreakPayloads(user, pipeline.scheduler.now(), {
      diamonds: 25,
      repeats: 4,
      transactionId: 'streak-tx',
    })) {
      pipeline.connector.emit(payload);
    }

    expect(pipeline.engine.getState().users[user.userId]?.totalDiamonds).toBe(100);
  });

  it('keeps the streak correct when replayed from a recording', async () => {
    const scenario = findScenario('gift-streak');
    expect(scenario).toBeDefined();

    const replay = createReplayPipeline(scenarioToSession(scenario!, 1_000));
    await replay.connect();
    replay.advance(10_000);

    const user = simulatedUser(2);
    expect(replay.engine.getState().users[user.userId]?.totalDiamonds).toBe(100);
  });
});

describe('replay determinism (Blueprint §54)', () => {
  const session = scenarioToSession(findScenario('join-and-gift')!, 1_000);

  const runReplay = (speed: number): string => {
    const replay = createReplayPipeline(session, { speed });
    void replay.connect();
    replay.advance(20_000);

    const state = replay.engine.getState();
    return JSON.stringify({
      users: state.users,
      ranking: state.ranking.entries,
      counters: state.counters,
      dancers: state.dancers.map((dancer) => ({ userId: dancer.userId, slotId: dancer.slotId })),
    });
  };

  it('produces the same final state on repeated runs', () => {
    expect(runReplay(1)).toBe(runReplay(1));
  });

  it('produces the same final state at 1x, 2x and 5x', () => {
    const atOneX = runReplay(1);

    expect(runReplay(2)).toBe(atOneX);
    expect(runReplay(5)).toBe(atOneX);
  });

  it('emits events in recorded order regardless of speed', () => {
    const orderAt = (speed: number): string[] => {
      const replay = createReplayPipeline(session, { speed });
      void replay.connect();
      replay.advance(20_000);
      return replay.normalizedEvents.map((event) => `${event.type}:${event.user.platformUserId}`);
    };

    expect(orderAt(5)).toEqual(orderAt(1));
  });

  it('finishes sooner at higher speed', () => {
    const scheduler = new ManualScheduler(0);
    expect(scheduler.pendingCount).toBe(0);

    const slow = createReplayPipeline(session, { speed: 1 });
    void slow.connect();
    slow.advance(2_000);
    const slowProgress = slow.normalizedEvents.length;

    const fast = createReplayPipeline(session, { speed: 5 });
    void fast.connect();
    fast.advance(2_000);

    expect(fast.normalizedEvents.length).toBeGreaterThan(slowProgress);
  });

  it('pauses and resumes without losing or duplicating events', async () => {
    const replay = createReplayPipeline(session, { speed: 1 });
    await replay.connect();

    replay.advance(1_000);
    const beforePause = replay.normalizedEvents.length;
    replay.replay.pause();

    replay.advance(5_000);
    expect(replay.normalizedEvents.length).toBe(beforePause);

    replay.replay.play();
    replay.advance(10_000);

    const all = replay.normalizedEvents.length;
    expect(all).toBe(session.steps.length);
    expect(new Set(replay.normalizedEvents.map((event) => JSON.stringify(event))).size).toBe(all);
  });
});

describe('normalizer boundary', () => {
  it('drops a malformed provider payload instead of crashing the pipeline', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    pipeline.connector.emitRaw({
      provider: 'mock',
      kind: 'gift',
      receivedAt: 1_000,
      payload: { kind: 'gift', at: 1_000, user: { userId: '' }, giftName: 'X', diamonds: -5 },
    });

    expect(pipeline.dropped).toHaveLength(1);
    expect(pipeline.dropped[0]?.reason).toBe('invalid');
    expect(pipeline.normalizedEvents).toHaveLength(0);
    expect(pipeline.engine.getState().counters.eventCount).toBe(0);
  });

  it('ignores an unknown provider without failing', async () => {
    const pipeline = createPipeline();
    await pipeline.connect();

    pipeline.connector.emitRaw({
      provider: 'eulerstream',
      kind: 'heartbeat',
      receivedAt: 1_000,
      payload: {},
    });

    expect(pipeline.dropped[0]?.reason).toBe('ignored');
    expect(pipeline.normalizedEvents).toHaveLength(0);
  });
});
