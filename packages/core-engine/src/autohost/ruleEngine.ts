/**
 * Pure Auto Host rule engine (Blueprint §49, Task 10 §4).
 *
 * `Trigger → Conditions → Cooldown → Actions`, evaluated deterministically and with no side
 * effects: `evaluate()` returns INTENTS. It never speaks, never draws, never dispatches a command
 * and never touches canonical game state — that is what keeps gift score, queue priority, ranking
 * and VIP membership out of the Auto Host's reach (§10.9).
 *
 * Determinism
 * - Rules run in `priority` descending, then `ruleId` ascending order. Two rules with the same
 *   priority therefore always execute in the same sequence.
 * - Cooldown arithmetic uses `trigger.at` — the time the transition actually happened — so replays
 *   and tests reproduce exactly. The injected `Clock` is used only for state introspection.
 *
 * This module imports nothing but contracts: no Electron, React, PixiJS, Node built-ins, Web
 * Speech, timers or ambient clocks.
 */

import type {
  AutoHostActionIntent,
  AutoHostConfig,
  AutoHostEngineState,
  AutoHostEvaluation,
  AutoHostRule,
  AutoHostSkip,
  AutoHostSkipReason,
  AutoHostTrigger,
} from '@dance-arena/contracts';

import type { Clock } from '../ports.js';
import { conditionsMatch } from './conditions.js';
import { dedupKeyFor, renderTemplate } from './templates.js';

export interface AutoHostRuleEngineOptions {
  readonly clock: Clock;
  readonly config: AutoHostConfig;
}

export interface AutoHostRuleEngine {
  evaluate(trigger: AutoHostTrigger): AutoHostEvaluation;
  updateConfig(config: AutoHostConfig): void;
  getConfig(): AutoHostConfig;
  /** Forgets cooldowns and counters — used on session reset so stale anti-spam never lingers. */
  resetSession(): void;
  getState(): AutoHostEngineState;
}

/** Sorted copy: highest priority first, `ruleId` ascending as the deterministic tie-break. */
function orderRules(rules: readonly AutoHostRule[]): AutoHostRule[] {
  return [...rules].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0;
  });
}

/** Rules sharing a `group` share one anti-spam budget; otherwise the budget is per rule. */
function cooldownKeyOf(rule: AutoHostRule): string {
  return rule.cooldown.group ?? rule.ruleId;
}

export function createAutoHostRuleEngine(options: AutoHostRuleEngineOptions): AutoHostRuleEngine {
  let config = options.config;
  let ordered = orderRules(config.rules);

  /** `cooldownKey -> last fired at`. */
  const lastFired = new Map<string, number>();
  /** `cooldownKey::userId -> last fired at`. */
  const lastFiredPerUser = new Map<string, number>();

  let evaluated = 0;
  let matched = 0;
  let intentCount = 0;
  let lastTriggerAt: number | undefined;
  let lastMatchedRuleId: string | undefined;

  /** Longest cooldown currently configured; used to prune the bookkeeping maps. */
  function maxCooldownMs(): number {
    let max = 0;
    for (const rule of config.rules) {
      max = Math.max(max, rule.cooldown.globalMs, rule.cooldown.perUserMs ?? 0);
    }
    return max;
  }

  /**
   * Drops cooldown entries that can no longer block anything.
   *
   * Without this the per-user map would grow with every viewer for the lifetime of a session,
   * which is exactly the unbounded growth the task forbids.
   */
  function pruneCooldowns(at: number): void {
    const horizon = at - maxCooldownMs();

    for (const [key, firedAt] of lastFired) {
      if (firedAt < horizon) lastFired.delete(key);
    }
    for (const [key, firedAt] of lastFiredPerUser) {
      if (firedAt < horizon) lastFiredPerUser.delete(key);
    }
  }

  function buildIntents(
    rule: AutoHostRule,
    trigger: AutoHostTrigger,
  ): { intents: AutoHostActionIntent[]; skippedActions: number } {
    const intents: AutoHostActionIntent[] = [];
    const userId = trigger.context.user?.id;
    let skippedActions = 0;

    for (const action of rule.actions) {
      switch (action.type) {
        case 'SHOW_ANNOUNCEMENT': {
          const rendered = renderTemplate(action.template, trigger.context, {
            maxLength: config.maxTextLength,
          });
          if (rendered.text.length === 0) {
            skippedActions += 1;
            break;
          }

          intents.push({
            kind: 'announcement',
            ruleId: rule.ruleId,
            at: trigger.at,
            text: rendered.text,
            level: action.level,
            durationMs: action.durationMs,
          });
          break;
        }

        case 'TTS': {
          const rendered = renderTemplate(action.template, trigger.context, {
            maxLength: config.maxTextLength,
          });
          if (rendered.text.length === 0) {
            skippedActions += 1;
            break;
          }

          intents.push({
            kind: 'tts',
            ruleId: rule.ruleId,
            at: trigger.at,
            text: rendered.text,
            priority: action.priority,
            ...(userId === undefined ? {} : { userId }),
            dedupKey: dedupKeyFor(rule.ruleId, userId, rendered.text),
          });
          break;
        }

        case 'START_SPOTLIGHT': {
          // A spotlight needs somebody to point at; a user-less trigger simply skips this action.
          if (userId === undefined) {
            skippedActions += 1;
            break;
          }

          intents.push({
            kind: 'spotlight',
            ruleId: rule.ruleId,
            at: trigger.at,
            userId,
            durationMs: action.durationMs,
          });
          break;
        }

        case 'SHOW_EFFECT':
          intents.push({
            kind: 'effect',
            ruleId: rule.ruleId,
            at: trigger.at,
            slot: action.slot,
            durationMs: action.durationMs,
            ...(userId === undefined ? {} : { userId }),
          });
          break;

        case 'SHOW_REACTION':
          intents.push({
            kind: 'reaction',
            ruleId: rule.ruleId,
            at: trigger.at,
            variant: action.variant,
            durationMs: action.durationMs,
            ...(userId === undefined ? {} : { userId }),
          });
          break;

        case 'SHOW_BUBBLE':
          intents.push({
            kind: 'bubble',
            ruleId: rule.ruleId,
            at: trigger.at,
            variant: action.variant,
            durationMs: action.durationMs,
            ...(userId === undefined ? {} : { userId }),
          });
          break;

        case 'START_MINIGAME_HOOK':
          // Task 10 ships no mini-game: this is a typed intention for a later task to consume.
          intents.push({
            kind: 'minigame-hook',
            ruleId: rule.ruleId,
            at: trigger.at,
            hookId: action.hookId,
            params: action.params ?? {},
          });
          break;
      }
    }

    return { intents, skippedActions };
  }

  function evaluate(trigger: AutoHostTrigger): AutoHostEvaluation {
    evaluated += 1;
    lastTriggerAt = trigger.at;

    const candidates = ordered.filter((rule) => rule.trigger === trigger.kind);
    const skipped: AutoHostSkip[] = [];
    const intents: AutoHostActionIntent[] = [];
    const matchedRuleIds: string[] = [];

    const skip = (ruleId: string, reason: AutoHostSkipReason): void => {
      skipped.push({ ruleId, reason });
    };

    if (!config.enabled) {
      for (const rule of candidates) skip(rule.ruleId, 'auto-host-disabled');
      return { at: trigger.at, trigger: trigger.kind, matchedRuleIds: [], skipped, intents: [] };
    }

    pruneCooldowns(trigger.at);
    const userId = trigger.context.user?.id;

    for (const rule of candidates) {
      if (!rule.enabled) {
        skip(rule.ruleId, 'rule-disabled');
        continue;
      }

      if (!conditionsMatch(rule.conditions, trigger.context)) {
        skip(rule.ruleId, 'condition-failed');
        continue;
      }

      const key = cooldownKeyOf(rule);
      const firedAt = lastFired.get(key);
      if (firedAt !== undefined && trigger.at - firedAt < rule.cooldown.globalMs) {
        skip(rule.ruleId, 'cooldown');
        continue;
      }

      const perUserMs = rule.cooldown.perUserMs;
      const userKey = userId === undefined ? undefined : `${key}::${userId}`;
      if (perUserMs !== undefined && userKey !== undefined) {
        const userFiredAt = lastFiredPerUser.get(userKey);
        if (userFiredAt !== undefined && trigger.at - userFiredAt < perUserMs) {
          skip(rule.ruleId, 'per-user-cooldown');
          continue;
        }
      }

      const built = buildIntents(rule, trigger);
      if (built.intents.length === 0) {
        // Nothing was produced (every template rendered empty), so the rule did not really fire
        // and must not consume its cooldown budget.
        skip(rule.ruleId, 'empty-text');
        continue;
      }

      lastFired.set(key, trigger.at);
      if (userKey !== undefined) lastFiredPerUser.set(userKey, trigger.at);

      matchedRuleIds.push(rule.ruleId);
      intents.push(...built.intents);
      lastMatchedRuleId = rule.ruleId;
    }

    matched += matchedRuleIds.length;
    intentCount += intents.length;

    return { at: trigger.at, trigger: trigger.kind, matchedRuleIds, skipped, intents };
  }

  return {
    evaluate,

    updateConfig(next: AutoHostConfig): void {
      config = next;
      ordered = orderRules(next.rules);
    },

    getConfig: () => config,

    resetSession(): void {
      lastFired.clear();
      lastFiredPerUser.clear();
      evaluated = 0;
      matched = 0;
      intentCount = 0;
      lastTriggerAt = undefined;
      lastMatchedRuleId = undefined;
    },

    getState(): AutoHostEngineState {
      const now = options.clock.now();
      let active = 0;

      for (const rule of config.rules) {
        const firedAt = lastFired.get(cooldownKeyOf(rule));
        if (firedAt !== undefined && now - firedAt < rule.cooldown.globalMs) active += 1;
      }

      return {
        enabled: config.enabled,
        ruleCount: config.rules.length,
        enabledRuleCount: config.rules.filter((rule) => rule.enabled).length,
        activeCooldowns: active,
        evaluated,
        matched,
        intents: intentCount,
        ...(lastTriggerAt === undefined ? {} : { lastTriggerAt }),
        ...(lastMatchedRuleId === undefined ? {} : { lastMatchedRuleId }),
      };
    },
  };
}
