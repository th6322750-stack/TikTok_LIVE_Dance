/**
 * Declarative condition evaluation (Task 10 §3.3).
 *
 * Each condition is a closed shape from the contract union, so this file is an exhaustive `switch`
 * and nothing else. There is no expression evaluator, no regex compiled from configuration and no
 * dynamic property access — a condition can only ask one of the questions the contract allows.
 *
 * A condition whose data is absent from the trigger evaluates to FALSE. Missing context never
 * "passes by default": a gift rule cannot fire on a follow just because there is no gift to check.
 */

import type { AutoHostCondition, AutoHostTriggerContext } from '@dance-arena/contracts';

export function evaluateCondition(
  condition: AutoHostCondition,
  context: AutoHostTriggerContext,
): boolean {
  switch (condition.type) {
    case 'gift-min-diamonds':
      return context.gift !== undefined && context.gift.diamonds >= condition.minDiamonds;

    case 'gift-tier-in':
      return context.gift?.tierId !== undefined && condition.tierIds.includes(context.gift.tierId);

    case 'comment-contains': {
      const comment = context.comment?.normalized;
      if (comment === undefined) return false;

      // The comment arrives already normalized (uppercase, diacritics stripped) from the
      // normalizer, so keyword matching is a plain substring test — never a user-supplied regex.
      return condition.values.some((value) => comment.includes(value));
    }

    case 'comment-equals': {
      const comment = context.comment?.normalized;
      if (comment === undefined) return false;

      return condition.values.includes(comment);
    }

    case 'command-in':
      return context.command !== undefined && condition.commands.includes(context.command.type);

    case 'rank-at-most':
      return context.rank !== undefined && context.rank.current <= condition.rank;

    case 'rank-entered-top': {
      const rank = context.rank;
      if (rank === undefined) return false;

      // Transition into the band only: already being inside it is not a promotion (§3.1).
      return rank.current <= condition.rank && (rank.previous ?? Infinity) > condition.rank;
    }

    case 'entered-vip':
      return context.rank?.enteredVip === true;

    case 'user-is-dancing':
      return context.user !== undefined && context.user.isDancing === condition.value;

    case 'user-is-vip':
      return context.user !== undefined && context.user.isVip === condition.value;

    case 'session-elapsed-min':
      return context.sessionElapsedMs !== undefined && context.sessionElapsedMs >= condition.minMs;
  }
}

/** All conditions must hold (AND). An empty list matches — the trigger kind is the only filter. */
export function conditionsMatch(
  conditions: readonly AutoHostCondition[],
  context: AutoHostTriggerContext,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, context));
}
