/**
 * Auto Host orchestration in Main (Task 10 §2, §6, §7).
 *
 * Responsibility split, as fixed by the handoff:
 *   Core   → evaluates rules, cooldowns and templates, returns INTENTS.
 *   Main   → owns timers, owns the TTS queue, turns intents into side effects.
 *   STAGE  → renders and speaks.
 *   CONTROL→ configures and observes.
 *
 * This service is the "Main" half. It contains no rule logic of its own: every decision about
 * whether something should happen was already made by the pure rule engine.
 *
 * Safety properties enforced here (Task 10 §10):
 * - the only outputs are stage events, a spotlight COMMAND routed through the Core Engine, TTS
 *   queue work and a typed mini-game hook — there is no network egress of any kind;
 * - a spotlight is requested through the canonical `game:start-spotlight` command, so the engine
 *   still owns spotlight state and Auto Host cannot write game state directly;
 * - nothing here can touch gift score, queue priority, ranking or VIP membership.
 */

import type { Scheduler } from '@dance-arena/connectors';
import type {
  AutoHostActionIntent,
  AutoHostConfig,
  AutoHostConfigPatch,
  AutoHostRecentAction,
  AutoHostRule,
  AutoHostRulePatch,
  AutoHostRuntimeState,
  AutoHostStatus,
  AutoHostTestTtsRequest,
  AutoHostTrigger,
  CommandResult,
  StageEvent,
} from '@dance-arena/contracts';
import { AutoHostConfigSchema } from '@dance-arena/contracts';
import {
  createAutoHostRuleEngine,
  createDefaultAutoHostConfig,
  dedupKeyFor,
  sanitizeText,
  type AutoHostRuleEngine,
  type Clock,
  type IdGenerator,
} from '@dance-arena/core-engine';

import { createTtsQueueService, type TtsProvider, type TtsQueueService } from './ttsQueue.js';

/** How often the Auto Host summary may be pushed to CONTROL — never at audio-frame rate (§7). */
export const AUTO_HOST_STATUS_INTERVAL_MS = 500;

/** Ring buffer of what the host recently did, shown in CONTROL for debugging. */
const RECENT_ACTION_CAPACITY = 20;

const DEFAULT_TEST_PHRASE = 'Xin chào, đây là giọng đọc thử của Dance Arena.';

export interface AutoHostServiceOptions {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly scheduler: Scheduler;
  readonly provider: TtsProvider;
  readonly config?: AutoHostConfig;
  /** Publishes an Auto Host visual to STAGE through the normal stage event path. */
  readonly emitStageEvent: (event: StageEvent) => void;
  /** Requests a spotlight through the canonical Core command — never by mutating state. */
  readonly startSpotlight: (userId: string, durationMs: number) => void;
  readonly publishStatus: (status: AutoHostStatus) => void;
  /** Gates the reminder timer; defaults to always-on for headless tests. */
  readonly isSessionActive?: () => boolean;
  /** Receives typed mini-game hooks. Task 10 implements no mini-game (§3.4). */
  readonly onMinigameHook?: (
    intent: Extract<AutoHostActionIntent, { kind: 'minigame-hook' }>,
  ) => void;
}

export interface AutoHostService {
  /** Feeds one trigger through the rule engine and dispatches whatever it produced. */
  handleTrigger(trigger: AutoHostTrigger): void;
  getState(): AutoHostRuntimeState;
  updateConfig(patch: AutoHostConfigPatch): AutoHostRuntimeState;
  setEnabled(enabled: boolean): AutoHostRuntimeState;
  setTtsEnabled(enabled: boolean): AutoHostRuntimeState;
  updateRule(patch: AutoHostRulePatch): AutoHostRuntimeState;
  testTts(request: AutoHostTestTtsRequest): CommandResult;
  clearTtsQueue(): CommandResult;
  /** Session reset / disconnect: forget cooldowns and pending speech (§6 "Reload/disconnect"). */
  resetSession(): void;
  /** Drives TTL sweeps and the throttled status push; called from the runtime's existing tick. */
  tick(now: number): void;
  start(): void;
  dispose(): void;
  readonly engine: AutoHostRuleEngine;
  readonly tts: TtsQueueService;
}

export function createAutoHostService(options: AutoHostServiceOptions): AutoHostService {
  let config = options.config ?? createDefaultAutoHostConfig();

  const engine = createAutoHostRuleEngine({ clock: options.clock, config });

  let statusDirty = true;
  let lastStatusAt = 0;
  const recentActions: AutoHostRecentAction[] = [];

  const markDirty = (): void => {
    statusDirty = true;
  };

  const tts = createTtsQueueService({
    clock: options.clock,
    ids: options.ids,
    provider: options.provider,
    policy: config.queue,
    voice: config.tts,
    onChange: markDirty,
  });

  let reminderCancel: (() => void) | undefined;
  let disposed = false;

  function remember(ruleId: string, kind: string, summary: string): void {
    recentActions.unshift({ at: options.clock.now(), ruleId, kind, summary });
    if (recentActions.length > RECENT_ACTION_CAPACITY) recentActions.pop();
    markDirty();
  }

  function dispatch(intent: AutoHostActionIntent): void {
    switch (intent.kind) {
      case 'announcement':
        options.emitStageEvent({
          type: 'stage:announcement',
          at: intent.at,
          text: intent.text,
          level: intent.level,
          durationMs: intent.durationMs,
        });
        remember(intent.ruleId, 'announcement', intent.text);
        break;

      case 'reaction':
        options.emitStageEvent({
          type: 'stage:host-reaction',
          at: intent.at,
          overlayId: options.ids.next('host-overlay'),
          ruleId: intent.ruleId,
          variant: intent.variant,
          durationMs: intent.durationMs,
          ...(intent.userId === undefined ? {} : { userId: intent.userId }),
        });
        remember(intent.ruleId, 'reaction', intent.variant);
        break;

      case 'bubble':
        options.emitStageEvent({
          type: 'stage:host-bubble',
          at: intent.at,
          overlayId: options.ids.next('host-overlay'),
          ruleId: intent.ruleId,
          variant: intent.variant,
          durationMs: intent.durationMs,
          ...(intent.userId === undefined ? {} : { userId: intent.userId }),
        });
        remember(intent.ruleId, 'bubble', intent.variant);
        break;

      case 'effect':
        // Visual only. It carries no diamonds and no tier, so it can never be mistaken for — or
        // replayed as — a gift event (§10.10).
        options.emitStageEvent({
          type: 'stage:host-effect',
          at: intent.at,
          overlayId: options.ids.next('host-overlay'),
          ruleId: intent.ruleId,
          slot: intent.slot,
          durationMs: intent.durationMs,
          ...(intent.userId === undefined ? {} : { userId: intent.userId }),
        });
        remember(intent.ruleId, 'effect', intent.slot);
        break;

      case 'spotlight':
        options.startSpotlight(intent.userId, intent.durationMs);
        remember(intent.ruleId, 'spotlight', intent.userId);
        break;

      case 'tts': {
        const outcome = tts.enqueue({
          ruleId: intent.ruleId,
          text: intent.text,
          priority: intent.priority,
          dedupKey: intent.dedupKey,
          ...(intent.userId === undefined ? {} : { userId: intent.userId }),
        });
        remember(intent.ruleId, 'tts', `${outcome}: ${intent.text}`);
        break;
      }

      case 'minigame-hook':
        // Typed intention only — Task 10 deliberately implements no mini-game gameplay.
        options.onMinigameHook?.(intent);
        remember(intent.ruleId, 'minigame-hook', intent.hookId);
        break;
    }
  }

  function handleTrigger(trigger: AutoHostTrigger): void {
    if (disposed) return;

    const evaluation = engine.evaluate(trigger);
    for (const intent of evaluation.intents) dispatch(intent);

    if (evaluation.intents.length > 0) markDirty();
  }

  function scheduleReminder(): void {
    reminderCancel?.();
    reminderCancel = undefined;

    if (disposed || !config.enabled || config.reminderIntervalMs <= 0) return;

    reminderCancel = options.scheduler.schedule(config.reminderIntervalMs, () => {
      reminderCancel = undefined;

      // Timers belong to Main; Core only ever receives the typed trigger (§5).
      if ((options.isSessionActive?.() ?? true) && config.enabled) {
        handleTrigger({ kind: 'timer:reminder', at: options.clock.now(), context: {} });
      }

      scheduleReminder();
    });
  }

  function applyConfig(next: AutoHostConfig): void {
    const previousInterval = config.reminderIntervalMs;
    const wasEnabled = config.enabled;

    config = next;
    engine.updateConfig(next);
    tts.setPolicy(next.queue);
    tts.setVoice(next.tts);

    if (previousInterval !== next.reminderIntervalMs || wasEnabled !== next.enabled) {
      scheduleReminder();
    }

    markDirty();
  }

  function buildStatus(): AutoHostStatus {
    const current = tts.getCurrent();
    const availability = options.provider.getAvailability?.();
    const reason = availability?.available === false ? availability.detail : undefined;

    return {
      at: options.clock.now(),
      enabled: config.enabled,
      ttsEnabled: config.tts.enabled,
      ttsAvailable: options.provider.isAvailable(),
      pending: tts.pendingCount,
      metrics: tts.getMetrics(),
      engine: engine.getState(),
      recentActions: [...recentActions],
      ...(current === undefined ? {} : { current }),
      ...(reason === undefined ? {} : { ttsUnavailableReason: reason }),
    };
  }

  function getState(): AutoHostRuntimeState {
    return { config, status: buildStatus() };
  }

  function publishNow(): void {
    lastStatusAt = options.clock.now();
    statusDirty = false;
    options.publishStatus(buildStatus());
  }

  return {
    engine,
    tts,
    handleTrigger,
    getState,

    updateConfig(patch: AutoHostConfigPatch): AutoHostRuntimeState {
      const merged: AutoHostConfig = {
        ...config,
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.reminderIntervalMs === undefined
          ? {}
          : { reminderIntervalMs: patch.reminderIntervalMs }),
        ...(patch.maxTextLength === undefined ? {} : { maxTextLength: patch.maxTextLength }),
        tts: { ...config.tts, ...(patch.tts ?? {}) },
        queue: {
          ...config.queue,
          ...(patch.queue ?? {}),
          ttlMs: { ...config.queue.ttlMs, ...(patch.queue?.ttlMs ?? {}) },
        },
      };

      // Re-validate the merged document: a patch may satisfy its own schema and still produce an
      // out-of-range configuration once combined with what Main already held.
      const parsed = AutoHostConfigSchema.safeParse(merged);
      if (parsed.success) applyConfig(parsed.data);

      return getState();
    },

    setEnabled(enabled: boolean): AutoHostRuntimeState {
      applyConfig({ ...config, enabled });

      // Turning the host off must not leave queued speech to surface later.
      if (!enabled) tts.clear();

      return getState();
    },

    setTtsEnabled(enabled: boolean): AutoHostRuntimeState {
      applyConfig({ ...config, tts: { ...config.tts, enabled } });
      return getState();
    },

    updateRule(patch: AutoHostRulePatch): AutoHostRuntimeState {
      const rules = config.rules.map((rule) =>
        rule.ruleId === patch.ruleId ? patchRule(rule, patch, config.maxTextLength) : rule,
      );

      const parsed = AutoHostConfigSchema.safeParse({ ...config, rules });
      if (parsed.success) applyConfig(parsed.data);

      return getState();
    },

    testTts(request: AutoHostTestTtsRequest): CommandResult {
      if (!config.tts.enabled) return { ok: false, reason: 'tts is disabled' };

      const sanitized = sanitizeText(request.text ?? DEFAULT_TEST_PHRASE, config.maxTextLength);
      if (sanitized.text.length === 0) return { ok: false, reason: 'empty phrase' };

      const priority = request.priority ?? 'normal';
      const outcome = tts.enqueue({
        ruleId: 'control:test',
        text: sanitized.text,
        priority,
        // A unique key per press: the operator pressing "Test" twice expects to hear it twice.
        dedupKey: dedupKeyFor(
          `control:test:${options.ids.next('tts-test')}`,
          undefined,
          sanitized.text,
        ),
      });

      markDirty();
      return outcome === 'queued'
        ? { ok: true }
        : { ok: false, reason: `test utterance ${outcome}` };
    },

    clearTtsQueue(): CommandResult {
      tts.clear();
      markDirty();
      return { ok: true };
    },

    resetSession(): void {
      engine.resetSession();
      tts.clear();
      recentActions.splice(0, recentActions.length);
      markDirty();
    },

    tick(now: number): void {
      if (disposed) return;

      tts.tick(now);

      if (statusDirty && now - lastStatusAt >= AUTO_HOST_STATUS_INTERVAL_MS) publishNow();
    },

    start(): void {
      scheduleReminder();
      publishNow();
    },

    dispose(): void {
      disposed = true;
      reminderCancel?.();
      reminderCancel = undefined;
      tts.dispose();
    },
  };
}

/**
 * Applies the bounded rule edit CONTROL is allowed to make.
 *
 * Only the FIRST announcement and the FIRST TTS action of a rule are re-worded, which is what the
 * CONTROL form exposes. Conditions, triggers and the action list itself are untouched — Task 10
 * ships no scripting editor (§9).
 */
function patchRule(
  rule: AutoHostRule,
  patch: AutoHostRulePatch,
  maxTextLength: number,
): AutoHostRule {
  let announcementDone = false;
  let ttsDone = false;

  const actions = rule.actions.map((action) => {
    if (action.type === 'SHOW_ANNOUNCEMENT' && !announcementDone) {
      announcementDone = true;
      const template = patch.templates?.announcement;
      return template === undefined
        ? action
        : { ...action, template: sanitizeText(template, maxTextLength).text };
    }

    if (action.type === 'TTS' && !ttsDone) {
      ttsDone = true;
      const template = patch.templates?.tts;
      return {
        ...action,
        ...(template === undefined ? {} : { template: sanitizeText(template, maxTextLength).text }),
        ...(patch.ttsPriority === undefined ? {} : { priority: patch.ttsPriority }),
      };
    }

    return action;
  });

  return {
    ...rule,
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    cooldown: {
      ...rule.cooldown,
      ...(patch.cooldown?.globalMs === undefined ? {} : { globalMs: patch.cooldown.globalMs }),
      ...(patch.cooldown?.perUserMs === undefined ? {} : { perUserMs: patch.cooldown.perUserMs }),
    },
    actions,
  };
}
