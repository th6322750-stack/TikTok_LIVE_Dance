/**
 * Default Vietnamese preset tests (Task 10 §5, §10).
 *
 * These assert the SAFETY properties of the shipped host policy, not its wording: no rule reads a
 * viewer comment aloud, no gift rule duplicates the GiftEngine effect, and every semantic variant
 * a rule names exists in the contract vocabulary.
 */

import type { AutoHostTrigger, AutoHostTriggerContext } from '@dance-arena/contracts';
import {
  AUTO_HOST_BUBBLES,
  AUTO_HOST_EFFECT_SLOTS,
  AUTO_HOST_REACTIONS,
  AutoHostConfigSchema,
} from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { createFixedClock } from '../ports.js';
import { createDefaultAutoHostConfig, VIETNAMESE_DEFAULT_RULES } from './defaultPreset.js';
import { createAutoHostRuleEngine } from './ruleEngine.js';

const USER: AutoHostTriggerContext['user'] = {
  id: 'user-1',
  nickname: 'Mai',
  isDancing: false,
  isVip: false,
};

function newEngine(): ReturnType<typeof createAutoHostRuleEngine> {
  return createAutoHostRuleEngine({
    clock: createFixedClock(0),
    config: createDefaultAutoHostConfig(),
  });
}

function fire(kind: AutoHostTrigger['kind'], at: number, context: AutoHostTriggerContext) {
  return newEngine().evaluate({ kind, at, context });
}

describe('preset shape', () => {
  it('validates against the contract', () => {
    expect(AutoHostConfigSchema.safeParse(createDefaultAutoHostConfig()).success).toBe(true);
  });

  it('has unique rule ids', () => {
    const ids = VIETNAMESE_DEFAULT_RULES.map((rule) => rule.ruleId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is a deep copy, so a runtime edit cannot mutate the shipped preset', () => {
    const first = createDefaultAutoHostConfig();
    const firstRule = first.rules[0];
    if (firstRule === undefined) throw new Error('preset is empty');

    firstRule.enabled = false;
    first.tts.rate = 1.9;

    const second = createDefaultAutoHostConfig();

    expect(second.rules[0]?.enabled).toBe(true);
    expect(second.tts.rate).toBe(1);
  });

  it('uses only semantic variants from the contract vocabulary — never a file path', () => {
    for (const rule of VIETNAMESE_DEFAULT_RULES) {
      for (const action of rule.actions) {
        if (action.type === 'SHOW_REACTION') expect(AUTO_HOST_REACTIONS).toContain(action.variant);
        if (action.type === 'SHOW_BUBBLE') expect(AUTO_HOST_BUBBLES).toContain(action.variant);
        if (action.type === 'SHOW_EFFECT') expect(AUTO_HOST_EFFECT_SLOTS).toContain(action.slot);
      }
    }
  });
});

describe('safety properties (Task 10 §10)', () => {
  it('never speaks raw comment text', () => {
    const commentRules = VIETNAMESE_DEFAULT_RULES.filter((rule) => rule.trigger === 'live:comment');

    expect(commentRules.length).toBeGreaterThan(0);
    for (const rule of commentRules) {
      expect(rule.actions.some((action) => action.type === 'TTS')).toBe(false);
    }
  });

  it('has no template that could interpolate comment text', () => {
    for (const rule of VIETNAMESE_DEFAULT_RULES) {
      for (const action of rule.actions) {
        const template =
          action.type === 'TTS' || action.type === 'SHOW_ANNOUNCEMENT' ? action.template : '';

        expect(template).not.toContain('{comment');
      }
    }
  });

  it('never adds a host effect to a gift rule (no duplicate GiftEngine FX)', () => {
    const giftRules = VIETNAMESE_DEFAULT_RULES.filter((rule) => rule.trigger === 'live:gift');

    expect(giftRules.length).toBeGreaterThan(0);
    for (const rule of giftRules) {
      expect(rule.actions.some((action) => action.type === 'SHOW_EFFECT')).toBe(false);
    }
  });

  it('gives every rule a cooldown', () => {
    for (const rule of VIETNAMESE_DEFAULT_RULES) {
      expect(rule.cooldown.globalMs).toBeGreaterThan(0);
    }
  });

  it('ships the mini-game hook disabled — Task 10 implements no mini-game', () => {
    const hookRules = VIETNAMESE_DEFAULT_RULES.filter((rule) =>
      rule.actions.some((action) => action.type === 'START_MINIGAME_HOOK'),
    );

    expect(hookRules.length).toBeGreaterThan(0);
    for (const rule of hookRules) expect(rule.enabled).toBe(false);
  });
});

describe('preset behaviour', () => {
  it('join produces a visual welcome and no speech', () => {
    const { intents } = fire('live:join', 1_000, { user: USER });

    expect(intents.map((intent) => intent.kind)).toEqual(['bubble']);
  });

  it('an accepted GO command produces the semantic `go` bubble', () => {
    const { intents } = fire('game:command-accepted', 1_000, {
      user: USER,
      command: { type: 'JOIN_STAGE' },
    });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ kind: 'bubble', variant: 'go' });
  });

  it('follow produces an announcement plus a normal-priority utterance', () => {
    const { intents } = fire('live:follow', 1_000, { user: USER });
    const tts = intents.find((intent) => intent.kind === 'tts');

    expect(intents.some((intent) => intent.kind === 'announcement')).toBe(true);
    expect(tts).toMatchObject({ priority: 'normal' });
    expect(tts?.kind === 'tts' ? tts.text : '').toContain('Mai');
  });

  it('separates gift tiers so exactly one gift rule can match', () => {
    for (const tierId of ['tier-1', 'tier-3', 'tier-4', 'tier-5']) {
      const { matchedRuleIds } = fire('live:gift', 1_000, {
        user: USER,
        gift: { name: 'Rose', diamonds: 500, tierId },
      });

      expect(matchedRuleIds).toHaveLength(1);
    }
  });

  it('escalates TTS priority with the gift tier', () => {
    const priorityFor = (tierId: string): string | undefined => {
      const intent = fire('live:gift', 1_000, {
        user: USER,
        gift: { name: 'Rose', diamonds: 500, tierId },
      }).intents.find((candidate) => candidate.kind === 'tts');

      return intent?.kind === 'tts' ? intent.priority : undefined;
    };

    expect(priorityFor('tier-1')).toBe('low');
    expect(priorityFor('tier-4')).toBe('high');
    expect(priorityFor('tier-5')).toBe('critical');
  });

  it('celebrates a completed party goal exactly once', () => {
    const { matchedRuleIds, intents } = fire('game:party-goal-complete', 1_000, {
      partyGoal: { current: 0, target: 6_000, completedCount: 1 },
    });

    expect(matchedRuleIds).toEqual(['party-goal-celebration']);
    expect(intents.filter((intent) => intent.kind === 'announcement')).toHaveLength(1);
    expect(intents.filter((intent) => intent.kind === 'tts')).toHaveLength(1);
  });

  it('gives one celebration when a viewer enters Top-3 and the VIP zone together', () => {
    const { matchedRuleIds } = fire('game:rank-promotion', 1_000, {
      user: USER,
      rank: { current: 2, previous: 8, enteredVip: true },
    });

    // Both rules share the `rank-celebration` cooldown group, so the second is suppressed.
    expect(matchedRuleIds).toEqual(['rank-promotion-top3']);
  });

  it('does not celebrate a ranking refresh that changed nothing about the band', () => {
    const { matchedRuleIds } = fire('game:rank-promotion', 1_000, {
      user: USER,
      rank: { current: 2, previous: 3, enteredVip: false },
    });

    expect(matchedRuleIds).toEqual([]);
  });

  it('reminds viewers to type GO on the timer trigger', () => {
    const { intents } = fire('timer:reminder', 1_000, {});

    expect(intents.map((intent) => intent.kind)).toEqual(['announcement', 'bubble', 'tts']);
  });

  it('reacts to configured comment keywords with a visual only', () => {
    const { intents } = fire('live:comment', 1_000, {
      user: USER,
      comment: { normalized: 'PHAN NAY HAY QUA' },
    });

    expect(intents.map((intent) => intent.kind)).toEqual(['reaction']);
  });

  it('ignores a comment that matches no keyword', () => {
    const { intents } = fire('live:comment', 1_000, {
      user: USER,
      comment: { normalized: 'XIN CHAO MOI NGUOI' },
    });

    expect(intents).toEqual([]);
  });
});
