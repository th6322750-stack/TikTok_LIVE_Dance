import type { EngineEvent, EngineConfigInput, StageEvent } from '@dance-arena/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGameEngine, type GameEngine } from './engine.js';
import { createFixedClock, createSequentialIdGenerator } from './ports.js';
import { comment, follow, gift, like, makeUser } from './testing/fixtures.js';

function setup(config: EngineConfigInput = {}): {
  engine: GameEngine;
  clock: ReturnType<typeof createFixedClock>;
  events: EngineEvent[];
} {
  const clock = createFixedClock(1_000);
  const events: EngineEvent[] = [];
  const engine = createGameEngine({
    clock,
    ids: createSequentialIdGenerator(),
    config,
  });
  engine.subscribe((event) => events.push(event));

  return { engine, clock, events };
}

const stageEventsOf = <T extends StageEvent['type']>(
  events: EngineEvent[],
  type: T,
): Extract<StageEvent, { type: T }>[] =>
  events.filter((event): event is Extract<StageEvent, { type: T }> => event.type === type);

describe('command parsing (Blueprint §17)', () => {
  it.each(['GO', 'JOIN', 'VAO', 'VÀO', 'vào', ' Vào '])('maps %s to JOIN_STAGE', (text) => {
    const { engine, events } = setup();
    engine.handleEvent(comment(makeUser('u1'), text, 1_000));

    expect(events.some((event) => event.type === 'game:command-accepted')).toBe(true);
    expect(engine.getState().dancers).toHaveLength(1);
  });

  it('does not treat a sentence containing an alias as a command', () => {
    const { engine } = setup();
    engine.handleEvent(comment(makeUser('u1'), 'lets go dancers', 1_000));

    expect(engine.getState().dancers).toHaveLength(0);
    expect(engine.getState().queue).toHaveLength(0);
  });

  it('counts a non-command comment as a comment only', () => {
    const { engine } = setup();
    engine.handleEvent(comment(makeUser('u1'), 'xin chào', 1_000));

    expect(engine.getState().counters.commentCount).toBe(1);
  });
});

describe('identity (Blueprint §10/§16)', () => {
  it('keys users by platform id, not nickname', () => {
    const { engine } = setup();

    engine.handleEvent(comment(makeUser('u1', { nickname: 'Same Name' }), 'hi', 1_000));
    engine.handleEvent(comment(makeUser('u2', { nickname: 'Same Name' }), 'hi', 1_100));

    expect(Object.keys(engine.getState().users).sort()).toEqual(['u1', 'u2']);
  });

  it('keeps one identity when a user renames mid-session', () => {
    const { engine } = setup();

    engine.handleEvent(gift(makeUser('u1', { nickname: 'Before' }), 1_000, { diamondValue: 100 }));
    engine.handleEvent(gift(makeUser('u1', { nickname: 'After' }), 2_000, { diamondValue: 100 }));

    const state = engine.getState();
    expect(Object.keys(state.users)).toEqual(['u1']);
    expect(state.users.u1?.nickname).toBe('After');
    expect(state.users.u1?.totalDiamonds).toBe(200);
  });
});

describe('queue (Blueprint §19)', () => {
  it('never queues the same user twice', () => {
    const { engine, events } = setup({ maxDancers: 1, cooldowns: { join: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    engine.handleEvent(comment(makeUser('u2'), 'GO', 1_100));
    engine.handleEvent(comment(makeUser('u2'), 'GO', 1_200));

    const state = engine.getState();
    expect(state.dancers).toHaveLength(1);
    expect(state.queue.filter((entry) => entry.userId === 'u2')).toHaveLength(1);
    expect(
      events.filter(
        (event) => event.type === 'game:command-rejected' && event.reason === 'already-queued',
      ),
    ).toHaveLength(1);
  });

  it('rejects a duplicate GO from a user already dancing', () => {
    const { engine, events } = setup({ cooldowns: { join: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_100));

    expect(engine.getState().dancers).toHaveLength(1);
    expect(
      events.some(
        (event) => event.type === 'game:command-rejected' && event.reason === 'already-dancing',
      ),
    ).toBe(true);
  });

  it('rejects joins when the queue is full', () => {
    const { engine, events } = setup({ maxDancers: 1, maxQueueSize: 2, cooldowns: { join: 0 } });

    for (const id of ['u1', 'u2', 'u3', 'u4']) {
      engine.handleEvent(comment(makeUser(id), 'GO', 1_000));
    }

    expect(engine.getState().queue).toHaveLength(2);
    expect(
      events.some(
        (event) => event.type === 'game:command-rejected' && event.reason === 'queue-full',
      ),
    ).toBe(true);
  });
});

describe('dancer slots (Blueprint §21/§22)', () => {
  it('fills 30 logical slots and queues the rest', () => {
    const { engine } = setup({ cooldowns: { join: 0 } });

    for (let index = 0; index < 35; index += 1) {
      engine.handleEvent(comment(makeUser(`u${index}`), 'GO', 1_000 + index));
    }

    const state = engine.getState();
    expect(state.dancers).toHaveLength(30);
    expect(state.queue).toHaveLength(5);
    expect(new Set(state.dancers.map((dancer) => dancer.slotId)).size).toBe(30);
  });

  it('assigns each dancer a unique slot with normalized coordinates', () => {
    const { engine } = setup({ cooldowns: { join: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    const [dancer] = engine.getState().dancers;

    expect(dancer?.slotId).toBe('normal-01');
    expect(dancer?.position.x).toBeGreaterThanOrEqual(0);
    expect(dancer?.position.x).toBeLessThanOrEqual(1);
    expect(dancer?.position.y).toBeLessThanOrEqual(1);
  });

  it('promotes a queued user when a dancer is kicked', () => {
    const { engine } = setup({ maxDancers: 1, cooldowns: { join: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    engine.handleEvent(comment(makeUser('u2'), 'GO', 1_100));
    expect(engine.getState().queue).toHaveLength(1);

    engine.dispatchCommand({ type: 'game:kick-user', userId: 'u1' });

    const state = engine.getState();
    expect(state.dancers).toHaveLength(1);
    expect(state.dancers[0]?.userId).toBe('u2');
    expect(state.queue).toHaveLength(0);
  });

  it('never puts two dancers in the same slot', () => {
    const { engine } = setup({ cooldowns: { join: 0, movement: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    engine.handleEvent(comment(makeUser('u2'), 'GO', 1_100));
    engine.handleEvent(comment(makeUser('u2'), 'LEFT', 1_200));

    const slotIds = engine.getState().dancers.map((dancer) => dancer.slotId);
    expect(new Set(slotIds).size).toBe(slotIds.length);
  });
});

describe('cooldown (Blueprint §18)', () => {
  let engine: GameEngine;
  let events: EngineEvent[];

  beforeEach(() => {
    ({ engine, events } = setup({ cooldowns: { movement: 1_000, join: 0 } }));
    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
  });

  it('rejects a movement inside the cooldown window', () => {
    engine.handleEvent(comment(makeUser('u1'), 'RIGHT', 2_000));
    engine.handleEvent(comment(makeUser('u1'), 'RIGHT', 2_500));

    const rejections = events.filter(
      (event) => event.type === 'game:command-rejected' && event.reason === 'cooldown',
    );
    expect(rejections).toHaveLength(1);
  });

  it('accepts the movement once the cooldown elapsed', () => {
    engine.handleEvent(comment(makeUser('u1'), 'RIGHT', 2_000));
    engine.handleEvent(comment(makeUser('u1'), 'RIGHT', 3_000));

    expect(stageEventsOf(events, 'stage:dancer-move')).toHaveLength(2);
  });

  it('shares one cooldown across all movement commands', () => {
    engine.handleEvent(comment(makeUser('u1'), 'RIGHT', 2_000));
    engine.handleEvent(comment(makeUser('u1'), 'LEFT', 2_100));

    expect(stageEventsOf(events, 'stage:dancer-move')).toHaveLength(1);
  });

  it('tracks cooldowns per user, not globally', () => {
    // u1 holds normal-01, u2 holds normal-02. u2 vacates normal-02 first so that u1's move is
    // rejected by cooldown only if the cooldown is (wrongly) shared, never by slot occupancy.
    engine.handleEvent(comment(makeUser('u2'), 'GO', 1_050));
    engine.handleEvent(comment(makeUser('u2'), 'RIGHT', 2_000));
    engine.handleEvent(comment(makeUser('u1'), 'RIGHT', 2_050));

    expect(stageEventsOf(events, 'stage:dancer-move')).toHaveLength(2);
    expect(
      events.some((event) => event.type === 'game:command-rejected' && event.reason === 'cooldown'),
    ).toBe(false);
  });

  it('does not start a cooldown for a rejected command', () => {
    const fresh = setup({ cooldowns: { join: 10_000 } });
    fresh.engine.handleEvent(comment(makeUser('u1'), 'LEFT', 1_000)); // rejected: not dancing
    fresh.engine.handleEvent(comment(makeUser('u1'), 'GO', 1_100));

    expect(fresh.engine.getState().dancers).toHaveLength(1);
  });
});

describe('gift deduplication (Blueprint §13)', () => {
  it('credits a x1→x2→x3→x4 streak as 4 repeats, not 1+2+3+4', () => {
    const { engine } = setup();
    const user = makeUser('u1');

    for (let repeat = 1; repeat <= 4; repeat += 1) {
      engine.handleEvent(
        gift(user, 1_000 + repeat * 100, {
          diamondValue: 10,
          repeatCount: repeat,
          streak: repeat < 4,
          streakEnded: repeat === 4,
          transactionId: 'tx-streak-1',
        }),
      );
    }

    expect(engine.getState().users.u1?.totalDiamonds).toBe(40);
    expect(engine.getState().counters.totalDiamonds).toBe(40);
  });

  it('ignores a re-delivered repeat count', () => {
    const { engine } = setup();
    const user = makeUser('u1');
    const options = { diamondValue: 5, streak: true, streakEnded: false, transactionId: 'tx-1' };

    engine.handleEvent(gift(user, 1_100, { ...options, repeatCount: 1 }));
    engine.handleEvent(gift(user, 1_200, { ...options, repeatCount: 2 }));
    engine.handleEvent(gift(user, 1_300, { ...options, repeatCount: 2 }));
    engine.handleEvent(gift(user, 1_400, { ...options, repeatCount: 1 }));

    expect(engine.getState().users.u1?.totalDiamonds).toBe(10);
  });

  it('counts two separate transactions of the same gift in full', () => {
    const { engine } = setup();
    const user = makeUser('u1');

    engine.handleEvent(gift(user, 1_000, { diamondValue: 100, transactionId: 'tx-a' }));
    engine.handleEvent(gift(user, 1_500, { diamondValue: 100, transactionId: 'tx-b' }));

    expect(engine.getState().users.u1?.totalDiamonds).toBe(200);
  });

  it('starts a new streak for the same gift after the dedup window without a transaction id', () => {
    const { engine } = setup({ giftDedupWindowMs: 1_000 });
    const user = makeUser('u1');

    engine.handleEvent(
      gift(user, 1_000, {
        diamondValue: 10,
        id: 'rose',
        repeatCount: 1,
        streak: true,
        streakEnded: false,
      }),
    );
    engine.handleEvent(
      gift(user, 9_000, {
        diamondValue: 10,
        id: 'rose',
        repeatCount: 1,
        streak: true,
        streakEnded: false,
      }),
    );

    expect(engine.getState().users.u1?.totalDiamonds).toBe(20);
  });

  it('emits exactly one gift effect per credited delta', () => {
    const { engine, events } = setup();
    const user = makeUser('u1');
    const options = { diamondValue: 10, streak: true, streakEnded: false, transactionId: 'tx-1' };

    engine.handleEvent(gift(user, 1_100, { ...options, repeatCount: 1 }));
    engine.handleEvent(gift(user, 1_200, { ...options, repeatCount: 2 }));
    engine.handleEvent(gift(user, 1_300, { ...options, repeatCount: 2 }));

    expect(stageEventsOf(events, 'stage:gift-effect')).toHaveLength(2);
  });

  it('derives the unit value when the provider only reports a total', () => {
    const { engine } = setup();
    const user = makeUser('u1');

    engine.handleEvent({
      version: 1,
      type: 'gift',
      timestamp: 1_000,
      user,
      gift: {
        name: 'Mystery',
        diamondValue: 0,
        repeatCount: 4,
        totalDiamonds: 400,
        streak: false,
        streakEnded: true,
        transactionId: 'tx-total-only',
      },
    });

    expect(engine.getState().users.u1?.totalDiamonds).toBe(400);
  });
});

describe('gift tiers (Blueprint §26)', () => {
  it.each([
    [5, 'tier-1'],
    [25, 'tier-2'],
    [99, 'tier-3'],
    [500, 'tier-4'],
    [1_500, 'tier-5'],
  ])('resolves %i diamonds to %s', (diamonds, tierId) => {
    const { engine, events } = setup();
    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: diamonds }));

    const [effect] = stageEventsOf(events, 'stage:gift-effect');
    expect(effect?.tierId).toBe(tierId);
    expect(effect?.diamonds).toBe(diamonds);
  });
});

describe('ranking and VIP (Blueprint §23/§24)', () => {
  it('orders by diamonds and is deterministic for ties', () => {
    const { engine } = setup();

    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 100, transactionId: 't1' }));
    engine.handleEvent(gift(makeUser('u2'), 1_100, { diamondValue: 300, transactionId: 't2' }));
    engine.handleEvent(gift(makeUser('u3'), 1_200, { diamondValue: 100, transactionId: 't3' }));

    const ranking = engine.getState().ranking.entries;
    expect(ranking.map((entry) => entry.userId)).toEqual(['u2', 'u1', 'u3']);
    expect(ranking.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('promotes rank 11 into the VIP window and demotes the displaced user', () => {
    const { engine, events } = setup({ vipCapacity: 10, rankingSize: 12, cooldowns: { join: 0 } });

    // 10 supporters with descending totals; u10 is the weakest VIP.
    for (let index = 1; index <= 10; index += 1) {
      engine.handleEvent(
        gift(makeUser(`u${index}`), 1_000 + index, {
          diamondValue: 1_000 - index * 10,
          transactionId: `tx-${index}`,
        }),
      );
    }

    expect(engine.getState().vip.userIds).toContain('u10');

    // Challenger outscores u10 exactly.
    engine.handleEvent(gift(makeUser('u11'), 2_000, { diamondValue: 950, transactionId: 'tx-11' }));

    const vip = engine.getState().vip.userIds;
    expect(vip).toContain('u11');
    expect(vip).not.toContain('u10');

    const rankingChanges = stageEventsOf(events, 'stage:ranking-change');
    const last = rankingChanges.at(-1);
    expect(last?.promoted).toContain('u11');
    expect(last?.demoted).toContain('u10');
  });

  it('moves a promoted dancer into the VIP zone and back on demotion', () => {
    const { engine } = setup({ vipCapacity: 1, rankingSize: 5, cooldowns: { join: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    engine.handleEvent(comment(makeUser('u2'), 'GO', 1_010));

    engine.handleEvent(gift(makeUser('u1'), 1_100, { diamondValue: 100, transactionId: 'a' }));
    expect(engine.getState().dancers.find((d) => d.userId === 'u1')?.zone).toBe('vip');

    engine.handleEvent(gift(makeUser('u2'), 1_200, { diamondValue: 500, transactionId: 'b' }));

    const dancers = engine.getState().dancers;
    expect(dancers.find((d) => d.userId === 'u2')?.zone).toBe('vip');
    expect(dancers.find((d) => d.userId === 'u1')?.zone).toBe('normal');
  });

  it('rejects MOVE_VIP from a non-VIP user', () => {
    const { engine, events } = setup({ vipCapacity: 1, cooldowns: { join: 0, vip: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    engine.handleEvent(comment(makeUser('u1'), 'VIP', 1_100));

    expect(
      events.some(
        (event) => event.type === 'game:command-rejected' && event.reason === 'not-eligible',
      ),
    ).toBe(true);
  });

  it('does not recompute ranking when nothing changed', () => {
    const { engine, events } = setup();

    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 100, transactionId: 'tx-1' }));
    const before = events.filter((event) => event.type === 'game:ranking-updated').length;

    engine.handleEvent(follow(makeUser('u1'), 1_100));
    engine.handleEvent(like(makeUser('u1'), 1_200, 5));

    expect(events.filter((event) => event.type === 'game:ranking-updated')).toHaveLength(before);
  });
});

describe('party goal (Blueprint §25)', () => {
  it('accumulates diamonds and completes when the target is reached', () => {
    const { engine, events } = setup({
      partyGoal: { enabled: true, target: 1_000, growthFactor: 1 },
    });

    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 600, transactionId: 'a' }));
    expect(engine.getState().partyGoal.current).toBe(600);
    expect(engine.getState().partyGoal.completedCount).toBe(0);

    engine.handleEvent(gift(makeUser('u1'), 1_100, { diamondValue: 500, transactionId: 'b' }));

    const goal = engine.getState().partyGoal;
    expect(goal.completedCount).toBe(1);
    expect(goal.current).toBe(100);
    expect(stageEventsOf(events, 'stage:party-goal').at(-1)?.completed).toBe(true);
    expect(stageEventsOf(events, 'stage:announcement')).toHaveLength(1);
  });

  it('grows the target by the configured factor', () => {
    const { engine } = setup({ partyGoal: { enabled: true, target: 100, growthFactor: 2 } });

    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 100, transactionId: 'a' }));

    expect(engine.getState().partyGoal.target).toBe(200);
  });

  it('ignores diamonds while disabled', () => {
    const { engine } = setup({ partyGoal: { enabled: false, target: 100, growthFactor: 1 } });

    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 500, transactionId: 'a' }));

    expect(engine.getState().partyGoal.current).toBe(0);
  });
});

describe('control commands', () => {
  it('clears the stage and refills from the queue', () => {
    const { engine } = setup({ maxDancers: 2, cooldowns: { join: 0 } });

    for (const id of ['u1', 'u2', 'u3']) {
      engine.handleEvent(comment(makeUser(id), 'GO', 1_000));
    }
    expect(engine.getState().dancers).toHaveLength(2);

    engine.dispatchCommand({ type: 'game:clear-stage' });

    const state = engine.getState();
    expect(state.dancers).toHaveLength(1);
    expect(state.dancers[0]?.userId).toBe('u3');
  });

  it('resets ranking without destroying the session', () => {
    const { engine } = setup();

    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 500, transactionId: 'a' }));
    const sessionId = engine.getState().session.sessionId;

    engine.dispatchCommand({ type: 'game:reset-ranking' });

    const state = engine.getState();
    expect(state.ranking.entries).toHaveLength(0);
    expect(state.users.u1?.totalDiamonds).toBe(0);
    expect(state.session.sessionId).toBe(sessionId);
  });

  it('rejects a kick for an unknown user', () => {
    const { engine } = setup();

    expect(engine.dispatchCommand({ type: 'game:kick-user', userId: 'nope' })).toEqual({
      ok: false,
      reason: 'unknown-user',
    });
  });

  it('starts and expires a spotlight through tick, never a hidden timer', () => {
    const { engine, events, clock } = setup();

    engine.handleEvent(comment(makeUser('u1'), 'hello', 1_000));
    engine.dispatchCommand({ type: 'game:start-spotlight', userId: 'u1', durationMs: 5_000 });

    expect(engine.getState().spotlight?.userId).toBe('u1');

    clock.set(3_000);
    engine.tick();
    expect(engine.getState().spotlight).toBeDefined();

    clock.set(7_000);
    engine.tick();
    expect(engine.getState().spotlight).toBeUndefined();
    expect(stageEventsOf(events, 'stage:spotlight-end')).toHaveLength(1);
  });
});

describe('snapshots', () => {
  it('produces a deterministic snapshot for the same event sequence', () => {
    const run = (): unknown => {
      const { engine } = setup({ cooldowns: { join: 0 } });

      engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
      engine.handleEvent(comment(makeUser('u2'), 'GO', 1_100));
      engine.handleEvent(gift(makeUser('u2'), 1_200, { diamondValue: 500, transactionId: 'tx' }));

      return engine.getSnapshot();
    };

    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('exposes a stage snapshot with display data for every dancer', () => {
    const { engine } = setup({ cooldowns: { join: 0 } });

    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));
    engine.handleEvent(gift(makeUser('u1'), 1_100, { diamondValue: 500, transactionId: 'tx' }));

    const snapshot = engine.getStageSnapshot();
    expect(snapshot.dancers).toHaveLength(1);
    expect(snapshot.dancers[0]?.nickname).toBe('User u1');
    expect(snapshot.dancers[0]?.avatarUrl).toBe('https://cdn.test/u1.webp');
    expect(snapshot.dancers[0]?.rank).toBe(1);
    expect(snapshot.ranking[0]?.totalDiamonds).toBe(500);
  });

  it('returns copies so a consumer cannot mutate canonical state', () => {
    const { engine } = setup({ cooldowns: { join: 0 } });
    engine.handleEvent(comment(makeUser('u1'), 'GO', 1_000));

    const state = engine.getState();
    state.dancers.pop();
    state.counters.totalDiamonds = 999;

    expect(engine.getState().dancers).toHaveLength(1);
    expect(engine.getState().counters.totalDiamonds).toBe(0);
  });
});

describe('session counters', () => {
  it('counts every event type', () => {
    const { engine } = setup();
    const user = makeUser('u1');

    engine.handleEvent(comment(user, 'hi', 1_000));
    engine.handleEvent(follow(user, 1_100));
    engine.handleEvent(like(user, 1_200, 7));
    engine.handleEvent(gift(user, 1_300, { diamondValue: 20, transactionId: 'g' }));

    const counters = engine.getState().counters;
    expect(counters).toMatchObject({
      commentCount: 1,
      followCount: 1,
      likeCount: 7,
      giftCount: 1,
      totalDiamonds: 20,
      eventCount: 4,
    });
    expect(engine.getState().users.u1?.follow).toBe(true);
  });
});
