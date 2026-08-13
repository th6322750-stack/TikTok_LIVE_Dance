/**
 * Pure rule engine tests (Task 10 §11 "Rule engine").
 *
 * Everything here is deterministic: time is the trigger's own timestamp, so there is no fake timer
 * and no sleeping anywhere in this file.
 */

import type {
  AutoHostAction,
  AutoHostCondition,
  AutoHostConfig,
  AutoHostRule,
  AutoHostTrigger,
  AutoHostTriggerContext,
  AutoHostTriggerKind,
} from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { createFixedClock } from '../ports.js';
import { createAutoHostRuleEngine, type AutoHostRuleEngine } from './ruleEngine.js';

const USER: AutoHostTriggerContext['user'] = {
  id: 'user-1',
  nickname: 'Mai',
  isDancing: false,
  isVip: false,
};

function rule(overrides: Partial<AutoHostRule> & Pick<AutoHostRule, 'ruleId'>): AutoHostRule {
  return {
    enabled: true,
    trigger: 'live:follow',
    priority: 10,
    conditions: [],
    cooldown: { globalMs: 0 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: 'hi {user.nickname}',
        level: 'info',
        durationMs: 1000,
      },
    ],
    ...overrides,
  };
}

function config(rules: AutoHostRule[], enabled = true): AutoHostConfig {
  return {
    enabled,
    reminderIntervalMs: 0,
    maxTextLength: 180,
    tts: { enabled: true, lang: 'vi-VN', rate: 1, pitch: 1, volume: 1 },
    queue: {
      maxQueued: 20,
      maxTextLength: 180,
      duplicateWindowMs: 8_000,
      ttlMs: { critical: 30_000, high: 25_000, normal: 20_000, low: 15_000 },
      interruptPolicy: 'never',
      maxRetries: 1,
    },
    rules,
  };
}

function engineWith(rules: AutoHostRule[], enabled = true): AutoHostRuleEngine {
  return createAutoHostRuleEngine({ clock: createFixedClock(0), config: config(rules, enabled) });
}

function trigger(
  kind: AutoHostTriggerKind,
  at: number,
  context: AutoHostTriggerContext = { user: USER },
): AutoHostTrigger {
  return { kind, at, context };
}

describe('trigger matching', () => {
  it('runs only rules whose trigger kind matches', () => {
    const engine = engineWith([
      rule({ ruleId: 'on-follow', trigger: 'live:follow' }),
      rule({ ruleId: 'on-share', trigger: 'live:share' }),
    ]);

    expect(engine.evaluate(trigger('live:follow', 1_000)).matchedRuleIds).toEqual(['on-follow']);
    expect(engine.evaluate(trigger('live:share', 2_000)).matchedRuleIds).toEqual(['on-share']);
  });

  it('produces nothing for a trigger no rule listens to', () => {
    const engine = engineWith([rule({ ruleId: 'on-follow' })]);
    const evaluation = engine.evaluate(trigger('timer:reminder', 1_000, {}));

    expect(evaluation.matchedRuleIds).toEqual([]);
    expect(evaluation.intents).toEqual([]);
    expect(evaluation.skipped).toEqual([]);
  });
});

describe('deterministic ordering', () => {
  it('runs higher priority first, then ruleId ascending', () => {
    const engine = engineWith([
      rule({ ruleId: 'zulu', priority: 5 }),
      rule({ ruleId: 'alpha', priority: 5 }),
      rule({ ruleId: 'top', priority: 99 }),
    ]);

    expect(engine.evaluate(trigger('live:follow', 1_000)).matchedRuleIds).toEqual([
      'top',
      'alpha',
      'zulu',
    ]);
  });

  it('produces the same order on repeated evaluations', () => {
    const build = (): AutoHostRuleEngine =>
      engineWith([
        rule({ ruleId: 'b', priority: 1 }),
        rule({ ruleId: 'a', priority: 1 }),
        rule({ ruleId: 'c', priority: 1 }),
      ]);

    const first = build().evaluate(trigger('live:follow', 1_000)).matchedRuleIds;
    const second = build().evaluate(trigger('live:follow', 1_000)).matchedRuleIds;

    expect(first).toEqual(second);
    expect(first).toEqual(['a', 'b', 'c']);
  });
});

describe('conditions', () => {
  const evaluateWith = (
    conditions: AutoHostCondition[],
    context: AutoHostTriggerContext,
    kind: AutoHostTriggerKind = 'live:gift',
  ): boolean => {
    const engine = engineWith([rule({ ruleId: 'r', trigger: kind, conditions })]);
    return engine.evaluate(trigger(kind, 1_000, context)).matchedRuleIds.length === 1;
  };

  it('matches gift minimum diamonds', () => {
    expect(
      evaluateWith([{ type: 'gift-min-diamonds', minDiamonds: 200 }], {
        user: USER,
        gift: { name: 'Rose', diamonds: 250 },
      }),
    ).toBe(true);

    expect(
      evaluateWith([{ type: 'gift-min-diamonds', minDiamonds: 200 }], {
        user: USER,
        gift: { name: 'Rose', diamonds: 5 },
      }),
    ).toBe(false);
  });

  it('matches a gift tier allow-list', () => {
    expect(
      evaluateWith([{ type: 'gift-tier-in', tierIds: ['tier-4', 'tier-5'] }], {
        gift: { name: 'Lion', diamonds: 1_000, tierId: 'tier-5' },
      }),
    ).toBe(true);

    expect(
      evaluateWith([{ type: 'gift-tier-in', tierIds: ['tier-4', 'tier-5'] }], {
        gift: { name: 'Rose', diamonds: 1, tierId: 'tier-1' },
      }),
    ).toBe(false);
  });

  it('fails when the trigger carries no data for the condition', () => {
    expect(evaluateWith([{ type: 'gift-min-diamonds', minDiamonds: 1 }], { user: USER })).toBe(
      false,
    );
  });

  it('matches comment keywords against the normalized comment', () => {
    expect(
      evaluateWith(
        [{ type: 'comment-contains', values: ['HAY QUA'] }],
        { comment: { normalized: 'PHAN NAY HAY QUA' } },
        'live:comment',
      ),
    ).toBe(true);

    expect(
      evaluateWith(
        [{ type: 'comment-equals', values: ['GG'] }],
        { comment: { normalized: 'GG WP' } },
        'live:comment',
      ),
    ).toBe(false);
  });

  it('matches accepted command types', () => {
    expect(
      evaluateWith(
        [{ type: 'command-in', commands: ['JOIN_STAGE'] }],
        { user: USER, command: { type: 'JOIN_STAGE' } },
        'game:command-accepted',
      ),
    ).toBe(true);

    expect(
      evaluateWith(
        [{ type: 'command-in', commands: ['JOIN_STAGE'] }],
        { user: USER, command: { type: 'MOVE_LEFT' } },
        'game:command-accepted',
      ),
    ).toBe(false);
  });

  it('ANDs every condition', () => {
    const conditions: AutoHostCondition[] = [
      { type: 'gift-min-diamonds', minDiamonds: 100 },
      { type: 'user-is-vip', value: true },
    ];

    expect(
      evaluateWith(conditions, {
        user: { ...USER, isVip: true },
        gift: { name: 'Rose', diamonds: 200 },
      }),
    ).toBe(true);

    expect(evaluateWith(conditions, { user: USER, gift: { name: 'Rose', diamonds: 200 } })).toBe(
      false,
    );
  });

  it('matches session elapsed time', () => {
    expect(
      evaluateWith(
        [{ type: 'session-elapsed-min', minMs: 60_000 }],
        { sessionElapsedMs: 90_000 },
        'timer:reminder',
      ),
    ).toBe(true);

    expect(
      evaluateWith(
        [{ type: 'session-elapsed-min', minMs: 60_000 }],
        { sessionElapsedMs: 10_000 },
        'timer:reminder',
      ),
    ).toBe(false);
  });
});

describe('rank promotion conditions', () => {
  const promotion = (current: number, previous?: number, enteredVip = false): AutoHostTrigger =>
    trigger('game:rank-promotion', 1_000, {
      user: USER,
      rank: { current, enteredVip, ...(previous === undefined ? {} : { previous }) },
    });

  it('rank-entered-top fires only on the transition into the band', () => {
    const engine = engineWith([
      rule({
        ruleId: 'top3',
        trigger: 'game:rank-promotion',
        conditions: [{ type: 'rank-entered-top', rank: 3 }],
      }),
    ]);

    // 7 → 2 crosses into the top 3.
    expect(engine.evaluate(promotion(2, 7)).matchedRuleIds).toEqual(['top3']);
    // 2 → 1 is an improvement, but the viewer was ALREADY inside the band.
    expect(engine.evaluate(promotion(1, 2)).matchedRuleIds).toEqual([]);
  });

  it('rank-entered-top fires for a viewer who was previously unranked', () => {
    const engine = engineWith([
      rule({
        ruleId: 'top3',
        trigger: 'game:rank-promotion',
        conditions: [{ type: 'rank-entered-top', rank: 3 }],
      }),
    ]);

    expect(engine.evaluate(promotion(3)).matchedRuleIds).toEqual(['top3']);
  });

  it('entered-vip only matches the update that moved the viewer into the VIP window', () => {
    const engine = engineWith([
      rule({
        ruleId: 'vip',
        trigger: 'game:rank-promotion',
        conditions: [{ type: 'entered-vip' }],
        cooldown: { globalMs: 0 },
      }),
    ]);

    expect(engine.evaluate(promotion(5, 9, true)).matchedRuleIds).toEqual(['vip']);
    expect(engine.evaluate(promotion(4, 5, false)).matchedRuleIds).toEqual([]);
  });
});

describe('cooldowns', () => {
  it('enforces a global cooldown', () => {
    const engine = engineWith([rule({ ruleId: 'r', cooldown: { globalMs: 5_000 } })]);

    expect(engine.evaluate(trigger('live:follow', 1_000)).matchedRuleIds).toEqual(['r']);
    expect(engine.evaluate(trigger('live:follow', 3_000)).matchedRuleIds).toEqual([]);
    expect(engine.evaluate(trigger('live:follow', 3_000)).skipped).toEqual([
      { ruleId: 'r', reason: 'cooldown' },
    ]);
  });

  it('fires again once the cooldown elapsed', () => {
    const engine = engineWith([rule({ ruleId: 'r', cooldown: { globalMs: 5_000 } })]);

    engine.evaluate(trigger('live:follow', 1_000));

    expect(engine.evaluate(trigger('live:follow', 6_000)).matchedRuleIds).toEqual(['r']);
  });

  it('enforces a per-user cooldown while other users still fire', () => {
    const engine = engineWith([
      rule({ ruleId: 'r', cooldown: { globalMs: 0, perUserMs: 60_000 } }),
    ]);

    const other: AutoHostTriggerContext = {
      user: { id: 'user-2', nickname: 'Lan', isDancing: false, isVip: false },
    };

    expect(engine.evaluate(trigger('live:follow', 1_000)).matchedRuleIds).toEqual(['r']);
    expect(engine.evaluate(trigger('live:follow', 2_000)).skipped).toEqual([
      { ruleId: 'r', reason: 'per-user-cooldown' },
    ]);
    expect(engine.evaluate(trigger('live:follow', 2_000, other)).matchedRuleIds).toEqual(['r']);
  });

  it('shares one budget across a cooldown group', () => {
    const engine = engineWith([
      rule({ ruleId: 'a', priority: 20, cooldown: { globalMs: 10_000, group: 'celebration' } }),
      rule({ ruleId: 'b', priority: 10, cooldown: { globalMs: 10_000, group: 'celebration' } }),
    ]);

    const evaluation = engine.evaluate(trigger('live:follow', 1_000));

    // `a` runs first and consumes the shared budget, so `b` is cooled down in the same pass.
    expect(evaluation.matchedRuleIds).toEqual(['a']);
    expect(evaluation.skipped).toEqual([{ ruleId: 'b', reason: 'cooldown' }]);
  });

  it('does not consume the cooldown when every template rendered empty', () => {
    const engine = engineWith([
      rule({
        ruleId: 'r',
        cooldown: { globalMs: 60_000 },
        actions: [
          { type: 'SHOW_ANNOUNCEMENT', template: '{unknown.token}', level: 'info', durationMs: 1 },
        ],
      }),
    ]);

    expect(engine.evaluate(trigger('live:follow', 1_000)).skipped).toEqual([
      { ruleId: 'r', reason: 'empty-text' },
    ]);

    // The budget was never spent, so a rule that later renders text is not blocked.
    engine.updateConfig(config([rule({ ruleId: 'r', cooldown: { globalMs: 60_000 } })]));
    expect(engine.evaluate(trigger('live:follow', 1_100)).matchedRuleIds).toEqual(['r']);
  });

  it('resetSession forgets cooldowns', () => {
    const engine = engineWith([rule({ ruleId: 'r', cooldown: { globalMs: 60_000 } })]);

    engine.evaluate(trigger('live:follow', 1_000));
    engine.resetSession();

    expect(engine.evaluate(trigger('live:follow', 2_000)).matchedRuleIds).toEqual(['r']);
  });

  it('prunes per-user cooldown bookkeeping so it cannot grow without bound', () => {
    const engine = engineWith([rule({ ruleId: 'r', cooldown: { globalMs: 0, perUserMs: 1_000 } })]);

    for (let index = 0; index < 500; index += 1) {
      engine.evaluate(
        trigger('live:follow', 1_000 + index, {
          user: { id: `user-${index}`, nickname: 'x', isDancing: false, isVip: false },
        }),
      );
    }

    // Long after every per-user window expired, the same users fire again — nothing was retained
    // that would block them.
    expect(engine.evaluate(trigger('live:follow', 900_000)).matchedRuleIds).toEqual(['r']);
  });
});

describe('enable switches', () => {
  it('produces no action when Auto Host is disabled', () => {
    const engine = engineWith([rule({ ruleId: 'r' })], false);
    const evaluation = engine.evaluate(trigger('live:follow', 1_000));

    expect(evaluation.intents).toEqual([]);
    expect(evaluation.skipped).toEqual([{ ruleId: 'r', reason: 'auto-host-disabled' }]);
  });

  it('produces no action for a disabled rule', () => {
    const engine = engineWith([rule({ ruleId: 'r', enabled: false })]);
    const evaluation = engine.evaluate(trigger('live:follow', 1_000));

    expect(evaluation.intents).toEqual([]);
    expect(evaluation.skipped).toEqual([{ ruleId: 'r', reason: 'rule-disabled' }]);
  });
});

describe('intents', () => {
  const allActions: AutoHostAction[] = [
    {
      type: 'SHOW_ANNOUNCEMENT',
      template: 'hi {user.nickname}',
      level: 'celebration',
      durationMs: 3_000,
    },
    { type: 'TTS', template: 'xin chao {user.nickname}', priority: 'high' },
    { type: 'START_SPOTLIGHT', durationMs: 5_000 },
    { type: 'SHOW_EFFECT', slot: 'celebration', durationMs: 2_000 },
    { type: 'SHOW_REACTION', variant: 'love', durationMs: 1_500 },
    { type: 'SHOW_BUBBLE', variant: 'go', durationMs: 1_200 },
    { type: 'START_MINIGAME_HOOK', hookId: 'bonus-round' },
  ];

  it('emits one intent per action, in action order', () => {
    const engine = engineWith([rule({ ruleId: 'r', actions: allActions })]);
    const { intents } = engine.evaluate(trigger('live:follow', 1_000));

    expect(intents.map((intent) => intent.kind)).toEqual([
      'announcement',
      'tts',
      'spotlight',
      'effect',
      'reaction',
      'bubble',
      'minigame-hook',
    ]);
  });

  it('carries a dedup key that includes rule and canonical user', () => {
    const engine = engineWith([
      rule({ ruleId: 'r', actions: [{ type: 'TTS', template: 'a', priority: 'low' }] }),
    ]);

    const [intent] = engine.evaluate(trigger('live:follow', 1_000)).intents;

    expect(intent?.kind).toBe('tts');
    if (intent?.kind !== 'tts') throw new Error('expected a tts intent');

    expect(intent.dedupKey).toContain('r');
    expect(intent.dedupKey).toContain('user-1');
    expect(intent.userId).toBe('user-1');
  });

  it('skips a spotlight when the trigger has no user', () => {
    const engine = engineWith([
      rule({
        ruleId: 'r',
        trigger: 'timer:reminder',
        actions: [
          { type: 'START_SPOTLIGHT', durationMs: 1_000 },
          { type: 'SHOW_BUBBLE', variant: 'go', durationMs: 1_000 },
        ],
      }),
    ]);

    const { intents } = engine.evaluate(trigger('timer:reminder', 1_000, {}));

    expect(intents.map((intent) => intent.kind)).toEqual(['bubble']);
  });

  it('never emits an intent that could change score, ranking, queue or VIP state', () => {
    const engine = engineWith([rule({ ruleId: 'r', actions: allActions })]);
    const kinds = engine.evaluate(trigger('live:follow', 1_000)).intents.map((i) => i.kind);

    for (const forbidden of ['gift', 'score', 'ranking', 'queue', 'vip']) {
      expect(kinds).not.toContain(forbidden);
    }
  });
});

describe('engine state', () => {
  it('reports rule counts and evaluation totals', () => {
    const engine = engineWith([rule({ ruleId: 'a' }), rule({ ruleId: 'b', enabled: false })]);

    engine.evaluate(trigger('live:follow', 1_000));
    const state = engine.getState();

    expect(state.ruleCount).toBe(2);
    expect(state.enabledRuleCount).toBe(1);
    expect(state.evaluated).toBe(1);
    expect(state.matched).toBe(1);
    expect(state.lastMatchedRuleId).toBe('a');
  });

  it('reflects a config swap', () => {
    const engine = engineWith([rule({ ruleId: 'a' })]);
    engine.updateConfig(config([rule({ ruleId: 'x' }), rule({ ruleId: 'y' })]));

    expect(engine.getState().ruleCount).toBe(2);
    expect(engine.evaluate(trigger('live:follow', 1_000)).matchedRuleIds).toEqual(['x', 'y']);
  });
});
