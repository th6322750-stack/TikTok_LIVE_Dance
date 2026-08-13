/**
 * Auto Host & TTS contracts (Blueprint §49–§51, Task 10).
 *
 * The Auto Host is a DECLARATIVE rule system: `Trigger → Conditions → Cooldown → Actions`. Every
 * shape in this file is data that can be validated at a boundary — there is no place to put a
 * JavaScript expression, a callback or a file path, which is what makes rule 6 of the task spec
 * ("no `eval` / arbitrary JS rule conditions") a property of the type system rather than a promise.
 *
 * Boundaries encoded here
 * - Triggers carry a WHITELISTED context. A raw provider payload can never reach a rule, a
 *   template or a renderer (Task 10 §3.2).
 * - Templates may only reference the variables listed in `AUTO_HOST_TEMPLATE_VARIABLES`. Comment
 *   text is deliberately absent: the default preset never speaks arbitrary viewer text (§10.7).
 * - Actions are visual/audio intents only. Nothing here can change gift score, queue priority,
 *   ranking or VIP state (§10.9), and `SHOW_EFFECT` is its own action so it can never be mistaken
 *   for a `GiftEvent` (§10.10).
 */

import { z } from 'zod';

import { NonEmptyStringSchema, NonNegativeIntSchema, PositiveIntSchema } from './common.js';
import { TimestampSchema } from './common.js';
import { GAME_COMMANDS } from './game/commands.js';

// ── Triggers ──────────────────────────────────────────────────────────────────────────────────

/**
 * What can start a rule evaluation.
 *
 * `game:*` kinds are produced from ACTUAL Core transitions (a completed party goal, a real rank
 * promotion, an accepted command) — never reconstructed by a renderer from a state refresh.
 * `timer:reminder` is produced by Main, which owns timers; Core only receives it.
 */
export const AUTO_HOST_TRIGGER_KINDS = [
  'live:join',
  'live:follow',
  'live:share',
  'live:comment',
  'live:gift',
  'game:party-goal-complete',
  'game:rank-promotion',
  'game:command-accepted',
  'timer:reminder',
] as const;

export type AutoHostTriggerKind = (typeof AUTO_HOST_TRIGGER_KINDS)[number];

export const AutoHostTriggerKindSchema = z.enum(AUTO_HOST_TRIGGER_KINDS);

/** Identity is always the canonical platform user id; nickname is display-only (Blueprint §10). */
export const AutoHostUserContextSchema = z.object({
  id: NonEmptyStringSchema,
  nickname: z.string(),
  isDancing: z.boolean(),
  isVip: z.boolean(),
});

export type AutoHostUserContext = z.infer<typeof AutoHostUserContextSchema>;

/** Gift facts AFTER deduplication — `diamonds` is what the engine actually credited (§13). */
export const AutoHostGiftContextSchema = z.object({
  name: z.string(),
  diamonds: NonNegativeIntSchema,
  tierId: z.string().optional(),
});

export type AutoHostGiftContext = z.infer<typeof AutoHostGiftContextSchema>;

export const AutoHostRankContextSchema = z.object({
  current: PositiveIntSchema,
  /** Absent when the user was previously unranked. */
  previous: PositiveIntSchema.optional(),
  /** True only on the ranking update that moved the user INTO the VIP window. */
  enteredVip: z.boolean(),
});

export type AutoHostRankContext = z.infer<typeof AutoHostRankContextSchema>;

export const AutoHostPartyGoalContextSchema = z.object({
  current: NonNegativeIntSchema,
  target: NonNegativeIntSchema,
  completedCount: NonNegativeIntSchema,
});

export type AutoHostPartyGoalContext = z.infer<typeof AutoHostPartyGoalContextSchema>;

/**
 * The complete, bounded surface a rule can see.
 *
 * `comment.normalized` exists so a condition can match a configured keyword list. It is NOT a
 * template variable, so no rule can turn viewer text into speech (§4 "Raw user comment text must
 * not be spoken by default", §10.7).
 */
export const AutoHostTriggerContextSchema = z
  .object({
    user: AutoHostUserContextSchema.optional(),
    gift: AutoHostGiftContextSchema.optional(),
    rank: AutoHostRankContextSchema.optional(),
    partyGoal: AutoHostPartyGoalContextSchema.optional(),
    command: z.object({ type: z.enum(GAME_COMMANDS) }).optional(),
    comment: z.object({ normalized: z.string() }).optional(),
    sessionElapsedMs: NonNegativeIntSchema.optional(),
  })
  .strict();

export type AutoHostTriggerContext = z.infer<typeof AutoHostTriggerContextSchema>;

export const AutoHostTriggerSchema = z.object({
  kind: AutoHostTriggerKindSchema,
  at: TimestampSchema,
  context: AutoHostTriggerContextSchema,
});

export type AutoHostTrigger = z.infer<typeof AutoHostTriggerSchema>;

// ── Conditions ────────────────────────────────────────────────────────────────────────────────

/**
 * Declarative conditions. Every member is a closed, validated shape — there is no `expression`
 * field, no regex source and no code string anywhere in this union (§3.3).
 */
export const AutoHostConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('gift-min-diamonds'), minDiamonds: NonNegativeIntSchema }),
  z.object({ type: z.literal('gift-tier-in'), tierIds: z.array(NonEmptyStringSchema).min(1) }),
  /** Matched against the already-normalized comment (uppercased, diacritics stripped). */
  z.object({ type: z.literal('comment-contains'), values: z.array(NonEmptyStringSchema).min(1) }),
  z.object({ type: z.literal('comment-equals'), values: z.array(NonEmptyStringSchema).min(1) }),
  z.object({ type: z.literal('command-in'), commands: z.array(z.enum(GAME_COMMANDS)).min(1) }),
  /** Simple band check: the user is currently within Top-N. */
  z.object({ type: z.literal('rank-at-most'), rank: PositiveIntSchema }),
  /**
   * Transition check: true only when this update moved the user INTO Top-N from outside it.
   * This is what keeps a promotion rule from firing on every ranking refresh (§3.1).
   */
  z.object({ type: z.literal('rank-entered-top'), rank: PositiveIntSchema }),
  z.object({ type: z.literal('entered-vip') }),
  z.object({ type: z.literal('user-is-dancing'), value: z.boolean() }),
  z.object({ type: z.literal('user-is-vip'), value: z.boolean() }),
  z.object({ type: z.literal('session-elapsed-min'), minMs: NonNegativeIntSchema }),
]);

export type AutoHostCondition = z.infer<typeof AutoHostConditionSchema>;

export type AutoHostConditionType = AutoHostCondition['type'];

// ── Actions ───────────────────────────────────────────────────────────────────────────────────

export const TTS_PRIORITIES = ['critical', 'high', 'normal', 'low'] as const;

export type TtsPriority = (typeof TTS_PRIORITIES)[number];

export const TtsPrioritySchema = z.enum(TTS_PRIORITIES);

/** Lower number wins. Used for queue ordering and for the interrupt policy. */
export const TTS_PRIORITY_RANK: Readonly<Record<TtsPriority, number>> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * Semantic reaction variants. A rule names a MEANING; STAGE resolves it to a DA-VISUAL-R3 asset
 * through the theme, so no rule and no renderer ever contains a file path (§3.4, locked rule 2).
 */
export const AUTO_HOST_REACTIONS = [
  'happy',
  'love',
  'wow',
  'fire',
  'party',
  'cheer',
  'gg',
] as const;

export type AutoHostReaction = (typeof AUTO_HOST_REACTIONS)[number];

export const AutoHostReactionSchema = z.enum(AUTO_HOST_REACTIONS);

/** Semantic command-bubble variants, resolved the same way. */
export const AUTO_HOST_BUBBLES = [
  'go',
  'join',
  'vip',
  'thank-you',
  'party-goal',
  'follow',
  'share',
] as const;

export type AutoHostBubble = (typeof AUTO_HOST_BUBBLES)[number];

export const AutoHostBubbleSchema = z.enum(AUTO_HOST_BUBBLES);

/**
 * Semantic host-effect slots.
 *
 * These are Auto Host celebration visuals, resolved from the theme's `hostEffects` binding. They
 * are NOT gift effects: they carry no diamonds, no tier and no score (§10.10).
 */
export const AUTO_HOST_EFFECT_SLOTS = ['celebration', 'party', 'sparkle'] as const;

export type AutoHostEffectSlot = (typeof AUTO_HOST_EFFECT_SLOTS)[number];

export const AutoHostEffectSlotSchema = z.enum(AUTO_HOST_EFFECT_SLOTS);

export const ANNOUNCEMENT_LEVELS = ['info', 'celebration', 'warning'] as const;

export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];

/** Parameters a mini-game hook may carry. Primitives only — no functions, no nested payloads. */
export const MinigameHookParamsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

export type MinigameHookParams = z.infer<typeof MinigameHookParamsSchema>;

export const AutoHostActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SHOW_ANNOUNCEMENT'),
    template: z.string(),
    level: z.enum(ANNOUNCEMENT_LEVELS),
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('TTS'),
    template: z.string(),
    priority: TtsPrioritySchema,
  }),
  z.object({
    type: z.literal('START_SPOTLIGHT'),
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('SHOW_EFFECT'),
    slot: AutoHostEffectSlotSchema,
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('SHOW_REACTION'),
    variant: AutoHostReactionSchema,
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('SHOW_BUBBLE'),
    variant: AutoHostBubbleSchema,
    durationMs: NonNegativeIntSchema,
  }),
  /**
   * Typed intention only. Task 10 ships no mini-game: the hook is recorded and published so a
   * later task can subscribe to it (§3.4).
   */
  z.object({
    type: z.literal('START_MINIGAME_HOOK'),
    hookId: NonEmptyStringSchema,
    params: MinigameHookParamsSchema.optional(),
  }),
]);

export type AutoHostAction = z.infer<typeof AutoHostActionSchema>;

export type AutoHostActionType = AutoHostAction['type'];

// ── Templates ─────────────────────────────────────────────────────────────────────────────────

/**
 * The COMPLETE set of template variables.
 *
 * Anything not on this list renders as empty text. There is no fallback that reads from the
 * trigger context dynamically, so adding a variable is a deliberate contract change.
 */
export const AUTO_HOST_TEMPLATE_VARIABLES = [
  'user.id',
  'user.nickname',
  'gift.name',
  'gift.diamonds',
  'gift.tierId',
  'rank.current',
  'rank.previous',
  'partyGoal.current',
  'partyGoal.target',
  'command.type',
] as const;

export type AutoHostTemplateVariable = (typeof AUTO_HOST_TEMPLATE_VARIABLES)[number];

/** Hard ceiling for any rendered string, independent of runtime configuration. */
export const AUTO_HOST_TEXT_HARD_LIMIT = 240;

// ── Rules ─────────────────────────────────────────────────────────────────────────────────────

export const AutoHostCooldownSchema = z.object({
  /** Minimum gap between two firings of this rule, regardless of user. */
  globalMs: NonNegativeIntSchema,
  /** Optional additional per-user gap; requires the trigger to carry a user. */
  perUserMs: NonNegativeIntSchema.optional(),
  /** Rules sharing a group share one anti-spam budget. */
  group: NonEmptyStringSchema.optional(),
});

export type AutoHostCooldown = z.infer<typeof AutoHostCooldownSchema>;

export const AutoHostRuleSchema = z.object({
  ruleId: NonEmptyStringSchema,
  description: z.string().optional(),
  enabled: z.boolean(),
  trigger: AutoHostTriggerKindSchema,
  /** Higher runs first; ties break on `ruleId` so ordering is fully deterministic (§3.5). */
  priority: z.number().int(),
  conditions: z.array(AutoHostConditionSchema),
  cooldown: AutoHostCooldownSchema,
  actions: z.array(AutoHostActionSchema).min(1),
});

export type AutoHostRule = z.infer<typeof AutoHostRuleSchema>;

// ── TTS settings & queue policy ───────────────────────────────────────────────────────────────

/**
 * Voice settings for the local, no-credential provider.
 *
 * There is deliberately no `apiKey`, `endpoint` or `voiceUri` field: Task 10 ships Web Speech only
 * and must not introduce a place where a cloud TTS secret could be stored (§10.5).
 */
export const TtsVoiceSettingsSchema = z.object({
  enabled: z.boolean(),
  lang: NonEmptyStringSchema,
  rate: z.number().min(0.5).max(2),
  pitch: z.number().min(0).max(2),
  volume: z.number().min(0).max(1),
});

export type TtsVoiceSettings = z.infer<typeof TtsVoiceSettingsSchema>;

export const TTS_INTERRUPT_POLICIES = ['never', 'lower-priority-only'] as const;

export type TtsInterruptPolicy = (typeof TTS_INTERRUPT_POLICIES)[number];

export const TtsQueuePolicySchema = z.object({
  maxQueued: PositiveIntSchema,
  maxTextLength: PositiveIntSchema,
  /** Window in which an identical (rule, user, text) utterance is suppressed. */
  duplicateWindowMs: NonNegativeIntSchema,
  /** Per-priority time-to-live: a stale thank-you is dropped rather than spoken late. */
  ttlMs: z.object({
    critical: NonNegativeIntSchema,
    high: NonNegativeIntSchema,
    normal: NonNegativeIntSchema,
    low: NonNegativeIntSchema,
  }),
  interruptPolicy: z.enum(TTS_INTERRUPT_POLICIES),
  /** How many times an interrupted utterance may be retried before it is dropped. */
  maxRetries: NonNegativeIntSchema,
});

export type TtsQueuePolicy = z.infer<typeof TtsQueuePolicySchema>;

export const AutoHostConfigSchema = z.object({
  enabled: z.boolean(),
  /** Interval of the Main-owned reminder timer (0 disables it). */
  reminderIntervalMs: NonNegativeIntSchema,
  /** Upper bound for any rendered announcement/TTS string. */
  maxTextLength: PositiveIntSchema,
  tts: TtsVoiceSettingsSchema,
  queue: TtsQueuePolicySchema,
  rules: z.array(AutoHostRuleSchema),
});

export type AutoHostConfig = z.infer<typeof AutoHostConfigSchema>;

// ── Action intents (rule engine output) ───────────────────────────────────────────────────────

/**
 * What `evaluate()` returns.
 *
 * An intent is a request for a side effect, not the side effect itself: the rule engine never
 * speaks, never draws and never dispatches a command. Main decides what to do with each one.
 */
export const AutoHostActionIntentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('announcement'),
    ruleId: NonEmptyStringSchema,
    at: TimestampSchema,
    text: z.string(),
    level: z.enum(ANNOUNCEMENT_LEVELS),
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    kind: z.literal('tts'),
    ruleId: NonEmptyStringSchema,
    at: TimestampSchema,
    text: z.string(),
    priority: TtsPrioritySchema,
    userId: z.string().optional(),
    /** Stable suppression key: rule + canonical user + normalized text (§6 "Queue rules"). */
    dedupKey: NonEmptyStringSchema,
  }),
  z.object({
    kind: z.literal('spotlight'),
    ruleId: NonEmptyStringSchema,
    at: TimestampSchema,
    userId: NonEmptyStringSchema,
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    kind: z.literal('effect'),
    ruleId: NonEmptyStringSchema,
    at: TimestampSchema,
    slot: AutoHostEffectSlotSchema,
    durationMs: NonNegativeIntSchema,
    userId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('reaction'),
    ruleId: NonEmptyStringSchema,
    at: TimestampSchema,
    variant: AutoHostReactionSchema,
    durationMs: NonNegativeIntSchema,
    userId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('bubble'),
    ruleId: NonEmptyStringSchema,
    at: TimestampSchema,
    variant: AutoHostBubbleSchema,
    durationMs: NonNegativeIntSchema,
    userId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('minigame-hook'),
    ruleId: NonEmptyStringSchema,
    at: TimestampSchema,
    hookId: NonEmptyStringSchema,
    params: MinigameHookParamsSchema,
  }),
]);

export type AutoHostActionIntent = z.infer<typeof AutoHostActionIntentSchema>;

export type AutoHostActionIntentKind = AutoHostActionIntent['kind'];

export const AUTO_HOST_SKIP_REASONS = [
  'auto-host-disabled',
  'rule-disabled',
  'condition-failed',
  'cooldown',
  'per-user-cooldown',
  'empty-text',
] as const;

export type AutoHostSkipReason = (typeof AUTO_HOST_SKIP_REASONS)[number];

export const AutoHostSkipSchema = z.object({
  ruleId: NonEmptyStringSchema,
  reason: z.enum(AUTO_HOST_SKIP_REASONS),
});

export type AutoHostSkip = z.infer<typeof AutoHostSkipSchema>;

export const AutoHostEvaluationSchema = z.object({
  at: TimestampSchema,
  trigger: AutoHostTriggerKindSchema,
  matchedRuleIds: z.array(NonEmptyStringSchema),
  skipped: z.array(AutoHostSkipSchema),
  intents: z.array(AutoHostActionIntentSchema),
});

export type AutoHostEvaluation = z.infer<typeof AutoHostEvaluationSchema>;

export const AutoHostEngineStateSchema = z.object({
  enabled: z.boolean(),
  ruleCount: NonNegativeIntSchema,
  enabledRuleCount: NonNegativeIntSchema,
  activeCooldowns: NonNegativeIntSchema,
  evaluated: NonNegativeIntSchema,
  matched: NonNegativeIntSchema,
  intents: NonNegativeIntSchema,
  lastTriggerAt: TimestampSchema.optional(),
  lastMatchedRuleId: z.string().optional(),
});

export type AutoHostEngineState = z.infer<typeof AutoHostEngineStateSchema>;

// ── TTS transport (Main ↔ STAGE) ──────────────────────────────────────────────────────────────

export const TtsSpeakRequestSchema = z.object({
  requestId: NonEmptyStringSchema,
  text: z.string().min(1).max(AUTO_HOST_TEXT_HARD_LIMIT),
  lang: NonEmptyStringSchema,
  rate: z.number().min(0.5).max(2),
  pitch: z.number().min(0).max(2),
  volume: z.number().min(0).max(1),
});

export type TtsSpeakRequest = z.infer<typeof TtsSpeakRequestSchema>;

export const TTS_SPEAK_STATUSES = ['completed', 'interrupted', 'unavailable', 'error'] as const;

export type TtsSpeakStatus = (typeof TTS_SPEAK_STATUSES)[number];

export const TtsSpeakResultSchema = z.object({
  requestId: NonEmptyStringSchema,
  status: z.enum(TTS_SPEAK_STATUSES),
  /** Short, already-sanitized reason. Never a stack trace or a provider payload. */
  error: z.string().max(200).optional(),
});

export type TtsSpeakResult = z.infer<typeof TtsSpeakResultSchema>;

export const TtsCancelRequestSchema = z.object({
  requestId: z.string().optional(),
});

export type TtsCancelRequest = z.infer<typeof TtsCancelRequestSchema>;

export const TtsAvailabilitySchema = z.object({
  available: z.boolean(),
  /** Short reason when unavailable, e.g. `speechSynthesis missing`. */
  detail: z.string().max(200).optional(),
});

export type TtsAvailability = z.infer<typeof TtsAvailabilitySchema>;

// ── Runtime status published to CONTROL ───────────────────────────────────────────────────────

export const TtsQueueMetricsSchema = z.object({
  enqueued: NonNegativeIntSchema,
  spoken: NonNegativeIntSchema,
  /** Duplicates collapsed inside the duplicate window. */
  suppressed: NonNegativeIntSchema,
  /** Evicted because the queue was full. */
  dropped: NonNegativeIntSchema,
  /** Dropped because the item outlived its TTL. */
  expired: NonNegativeIntSchema,
  /** Speech attempts that found no working local provider. */
  unavailable: NonNegativeIntSchema,
  errors: NonNegativeIntSchema,
  interrupted: NonNegativeIntSchema,
});

export type TtsQueueMetrics = z.infer<typeof TtsQueueMetricsSchema>;

export const TtsQueueItemViewSchema = z.object({
  requestId: NonEmptyStringSchema,
  ruleId: NonEmptyStringSchema,
  priority: TtsPrioritySchema,
  text: z.string(),
  enqueuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
});

export type TtsQueueItemView = z.infer<typeof TtsQueueItemViewSchema>;

export const AutoHostRecentActionSchema = z.object({
  at: TimestampSchema,
  ruleId: NonEmptyStringSchema,
  kind: NonEmptyStringSchema,
  summary: z.string(),
});

export type AutoHostRecentAction = z.infer<typeof AutoHostRecentActionSchema>;

export const AutoHostStatusSchema = z.object({
  at: TimestampSchema,
  enabled: z.boolean(),
  ttsEnabled: z.boolean(),
  /** Whether a local speech device is currently reachable (STAGE open + Web Speech present). */
  ttsAvailable: z.boolean(),
  ttsUnavailableReason: z.string().optional(),
  current: TtsQueueItemViewSchema.optional(),
  pending: NonNegativeIntSchema,
  metrics: TtsQueueMetricsSchema,
  engine: AutoHostEngineStateSchema,
  recentActions: z.array(AutoHostRecentActionSchema),
});

export type AutoHostStatus = z.infer<typeof AutoHostStatusSchema>;

export const AutoHostRuntimeStateSchema = z.object({
  config: AutoHostConfigSchema,
  status: AutoHostStatusSchema,
});

export type AutoHostRuntimeState = z.infer<typeof AutoHostRuntimeStateSchema>;

// ── CONTROL → Main request payloads ───────────────────────────────────────────────────────────

export const AutoHostConfigPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    reminderIntervalMs: NonNegativeIntSchema.optional(),
    maxTextLength: PositiveIntSchema.optional(),
    tts: TtsVoiceSettingsSchema.partial().optional(),
    queue: TtsQueuePolicySchema.partial().optional(),
  })
  .strict();

export type AutoHostConfigPatch = z.infer<typeof AutoHostConfigPatchSchema>;

/**
 * The bounded rule edit CONTROL may perform.
 *
 * Note what is missing: `conditions`, `trigger` and the action list. Task 10 deliberately ships no
 * scripting editor (§9) — an operator may toggle a rule, retune its cooldown and reword its safe
 * templates, nothing more.
 */
export const AutoHostRulePatchSchema = z
  .object({
    ruleId: NonEmptyStringSchema,
    enabled: z.boolean().optional(),
    cooldown: z
      .object({
        globalMs: NonNegativeIntSchema.optional(),
        perUserMs: NonNegativeIntSchema.optional(),
      })
      .strict()
      .optional(),
    templates: z
      .object({
        announcement: z.string().max(AUTO_HOST_TEXT_HARD_LIMIT).optional(),
        tts: z.string().max(AUTO_HOST_TEXT_HARD_LIMIT).optional(),
      })
      .strict()
      .optional(),
    ttsPriority: TtsPrioritySchema.optional(),
  })
  .strict();

export type AutoHostRulePatch = z.infer<typeof AutoHostRulePatchSchema>;

export const AutoHostTestTtsRequestSchema = z
  .object({
    text: z.string().max(AUTO_HOST_TEXT_HARD_LIMIT).optional(),
    priority: TtsPrioritySchema.optional(),
  })
  .strict();

export type AutoHostTestTtsRequest = z.infer<typeof AutoHostTestTtsRequestSchema>;

export const AutoHostSetEnabledRequestSchema = z.object({ enabled: z.boolean() }).strict();

export type AutoHostSetEnabledRequest = z.infer<typeof AutoHostSetEnabledRequestSchema>;
