/**
 * Auto Host triggers emitted by the Core Engine (Task 10 §3.1).
 *
 * The point of these tests is WHERE the trigger comes from: a real Core transition. A rank
 * promotion that never happened, a party goal that is merely still complete, a duplicate gift that
 * credited nothing and a rejected command must all produce no trigger at all — no renderer gets a
 * chance to reconstruct one.
 */

import type { AutoHostTrigger, EngineEvent } from '@dance-arena/contracts';
import { isHostTriggerEvent } from '@dance-arena/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGameEngine, type GameEngine } from '../engine.js';
import { createFixedClock } from '../ports.js';
import { comment, follow, gift, join, makeUser, share } from '../testing/fixtures.js';

let engine: GameEngine;
let triggers: AutoHostTrigger[];

beforeEach(() => {
  const clock = createFixedClock(1_000);
  engine = createGameEngine({
    clock,
    config: { partyGoal: { enabled: true, target: 100, growthFactor: 2 } },
  });
  triggers = [];

  engine.subscribe((event: EngineEvent) => {
    if (isHostTriggerEvent(event)) triggers.push(event.trigger);
  });
});

const kinds = (): string[] => triggers.map((trigger) => trigger.kind);
const of = (kind: string): AutoHostTrigger[] => triggers.filter((t) => t.kind === kind);

describe('live event triggers', () => {
  it('emits join / follow / share / comment triggers with a whitelisted user context', () => {
    const user = makeUser('u1');

    engine.handleEvent(join(user, 1_000));
    engine.handleEvent(follow(user, 1_100));
    engine.handleEvent(share(user, 1_200));
    engine.handleEvent(comment(user, 'hello', 1_300));

    expect(kinds()).toEqual(['live:join', 'live:follow', 'live:share', 'live:comment']);

    const [first] = triggers;
    expect(first?.context.user).toEqual({
      id: 'u1',
      nickname: 'User u1',
      isDancing: false,
      isVip: false,
    });
  });

  it('carries the normalized comment for keyword matching, never the raw text', () => {
    engine.handleEvent(comment(makeUser('u1'), '  Hay quá!!  ', 1_000));

    const [trigger] = of('live:comment');
    expect(trigger?.context.comment?.normalized).toBe('HAY QUA!!');
  });

  it('includes session elapsed time', () => {
    engine.handleEvent(follow(makeUser('u1'), 61_000));

    expect(of('live:follow')[0]?.context.sessionElapsedMs).toBe(60_000);
  });
});

describe('gift triggers', () => {
  it('fires with the CREDITED diamonds and the engine-resolved tier', () => {
    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 250, transactionId: 'tx-1' }));

    const [trigger] = of('live:gift');
    expect(trigger?.context.gift).toEqual({ name: 'Rose', diamonds: 250, tierId: 'tier-4' });
  });

  it('does not fire a second time for a replayed duplicate transaction', () => {
    const user = makeUser('u1');
    const event = gift(user, 1_000, { diamondValue: 250, transactionId: 'tx-1' });

    engine.handleEvent(event);
    engine.handleEvent({ ...event, timestamp: 1_500 });

    expect(of('live:gift')).toHaveLength(1);
  });

  it('fires once per credited streak increment, never for a repeated cumulative frame', () => {
    const user = makeUser('u1');

    engine.handleEvent(
      gift(user, 1_000, { diamondValue: 10, repeatCount: 1, streak: true, streakEnded: false }),
    );
    engine.handleEvent(
      gift(user, 1_100, { diamondValue: 10, repeatCount: 2, streak: true, streakEnded: false }),
    );
    // The provider re-sends x2 — no new diamonds, so no new thank-you.
    engine.handleEvent(
      gift(user, 1_200, { diamondValue: 10, repeatCount: 2, streak: true, streakEnded: false }),
    );

    const diamonds = of('live:gift').map((trigger) => trigger.context.gift?.diamonds);
    expect(diamonds).toEqual([10, 10]);
  });
});

describe('accepted command triggers', () => {
  it('fires only for a command the engine ACCEPTED', () => {
    const user = makeUser('u1');

    engine.handleEvent(comment(user, 'GO', 1_000));
    // The second GO is rejected: the viewer is already dancing.
    engine.handleEvent(comment(user, 'GO', 60_000));

    const accepted = of('game:command-accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.context.command).toEqual({ type: 'JOIN_STAGE' });
  });

  it('does not fire for a comment that is not a command', () => {
    engine.handleEvent(comment(makeUser('u1'), 'xin chao', 1_000));

    expect(of('game:command-accepted')).toEqual([]);
  });

  it('reports the viewer as dancing once they are on stage', () => {
    const user = makeUser('u1');

    engine.handleEvent(comment(user, 'GO', 1_000));
    engine.handleEvent(follow(user, 2_000));

    expect(of('live:follow')[0]?.context.user?.isDancing).toBe(true);
  });
});

describe('party goal triggers', () => {
  it('fires exactly once for a completion transition', () => {
    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 150, transactionId: 'tx-1' }));

    expect(of('game:party-goal-complete')).toHaveLength(1);
  });

  it('fires once even when a single mega gift rolls the goal over several times', () => {
    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 1_000, transactionId: 'tx-1' }));

    expect(of('game:party-goal-complete')).toHaveLength(1);
  });

  it('does not fire again on later events while the goal remains configured', () => {
    const user = makeUser('u1');

    engine.handleEvent(gift(user, 1_000, { diamondValue: 150, transactionId: 'tx-1' }));
    engine.handleEvent(follow(user, 2_000));
    engine.handleEvent(gift(user, 3_000, { diamondValue: 5, transactionId: 'tx-2' }));

    expect(of('game:party-goal-complete')).toHaveLength(1);
  });

  it('does not fire when CONTROL merely reconfigures the goal', () => {
    engine.dispatchCommand({ type: 'game:set-party-goal', enabled: true, target: 10 });

    expect(of('game:party-goal-complete')).toEqual([]);
  });

  it('carries the NEXT target so a template can announce it', () => {
    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 150, transactionId: 'tx-1' }));

    expect(of('game:party-goal-complete')[0]?.context.partyGoal).toMatchObject({
      target: 200,
      completedCount: 1,
    });
  });
});

describe('rank promotion triggers', () => {
  it('fires when a viewer becomes newly ranked', () => {
    engine.handleEvent(gift(makeUser('u1'), 1_000, { diamondValue: 50, transactionId: 'tx-1' }));

    const promotions = of('game:rank-promotion');
    expect(promotions).toHaveLength(1);
    expect(promotions[0]?.context.rank).toMatchObject({ current: 1, enteredVip: true });
    expect(promotions[0]?.context.rank?.previous).toBeUndefined();
  });

  it('fires with the previous rank when a viewer actually moves up', () => {
    const alice = makeUser('u1');
    const bob = makeUser('u2');

    engine.handleEvent(gift(alice, 1_000, { diamondValue: 100, transactionId: 'tx-1' }));
    engine.handleEvent(gift(bob, 2_000, { diamondValue: 50, transactionId: 'tx-2' }));
    triggers = [];

    // Bob overtakes Alice: rank 2 → 1.
    engine.handleEvent(gift(bob, 3_000, { diamondValue: 200, transactionId: 'tx-3' }));

    const promotion = of('game:rank-promotion').find(
      (trigger) => trigger.context.user?.id === 'u2',
    );
    expect(promotion?.context.rank).toMatchObject({ current: 1, previous: 2 });
  });

  it('does not fire when a gift changes the score but not the position', () => {
    const user = makeUser('u1');

    engine.handleEvent(gift(user, 1_000, { diamondValue: 100, transactionId: 'tx-1' }));
    triggers = [];

    engine.handleEvent(gift(user, 2_000, { diamondValue: 100, transactionId: 'tx-2' }));

    expect(of('game:rank-promotion')).toEqual([]);
  });

  it('marks enteredVip only on the update that entered the VIP window', () => {
    const user = makeUser('u1');

    engine.handleEvent(gift(user, 1_000, { diamondValue: 100, transactionId: 'tx-1' }));
    expect(of('game:rank-promotion')[0]?.context.rank?.enteredVip).toBe(true);

    triggers = [];
    engine.handleEvent(gift(user, 2_000, { diamondValue: 100, transactionId: 'tx-2' }));
    expect(of('game:rank-promotion')).toEqual([]);
  });
});

describe('namespace isolation', () => {
  it('keeps host triggers out of the CONTROL and STAGE streams', () => {
    const controlAndStage: string[] = [];
    engine.subscribe((event: EngineEvent) => {
      if (!isHostTriggerEvent(event)) controlAndStage.push(event.type);
    });

    engine.handleEvent(follow(makeUser('u1'), 1_000));

    for (const type of controlAndStage) {
      expect(type.startsWith('host:')).toBe(false);
    }
    expect(of('live:follow')).toHaveLength(1);
  });
});
