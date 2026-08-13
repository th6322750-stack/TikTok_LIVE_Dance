/**
 * STAGE render contracts (Blueprint §29–§31).
 *
 * STAGE receives ONE snapshot on start/reload and incremental events afterwards. It never receives
 * the full GameState per frame and never receives a raw provider payload.
 *
 * Every event carries only what a renderer needs to draw — no queue, no scoring rules, no tier
 * thresholds. Tier resolution already happened in the engine (Blueprint §26/§27).
 */

import { z } from 'zod';

import {
  AutoHostBubbleSchema,
  AutoHostEffectSlotSchema,
  AutoHostReactionSchema,
} from '../auto-host.js';
import {
  NonEmptyStringSchema,
  NonNegativeIntSchema,
  NormalizedPositionSchema,
  TimestampSchema,
} from '../common.js';
import {
  DANCER_STATUSES,
  DANCER_ZONES,
  PartyGoalStateSchema,
  SpotlightStateSchema,
} from '../game/state.js';

/** A dancer as STAGE needs it: logical slot + the display data for DancerView (§31). */
export const StageDancerSchema = z.object({
  dancerId: NonEmptyStringSchema,
  userId: NonEmptyStringSchema,
  slotId: NonEmptyStringSchema,
  zone: z.enum(DANCER_ZONES),
  costumeId: NonEmptyStringSchema,
  /** Engine-provided normalized position; STAGE may prefer its own slot layout (§22). */
  position: NormalizedPositionSchema,
  status: z.enum(DANCER_STATUSES),
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  /** Present when the user is currently ranked; drives the rank badge. */
  rank: z.number().int().positive().optional(),
});

export type StageDancer = z.infer<typeof StageDancerSchema>;

export const StageRankingEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: NonEmptyStringSchema,
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  totalDiamonds: NonNegativeIntSchema,
});

export type StageRankingEntry = z.infer<typeof StageRankingEntrySchema>;

// ── Snapshot ──────────────────────────────────────────────────────────────────────────────────

export const StageSnapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: TimestampSchema,
  sessionId: NonEmptyStringSchema,
  dancers: z.array(StageDancerSchema),
  ranking: z.array(StageRankingEntrySchema),
  partyGoal: PartyGoalStateSchema,
  spotlight: SpotlightStateSchema.optional(),
});

export type StageSnapshot = z.infer<typeof StageSnapshotSchema>;

// ── Incremental events ────────────────────────────────────────────────────────────────────────

export const DANCER_REMOVE_REASONS = [
  'kicked',
  'left',
  'replaced',
  'stage-cleared',
  'session-reset',
] as const;

export type DancerRemoveReason = (typeof DANCER_REMOVE_REASONS)[number];

export const StageEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stage:dancer-spawn'),
    at: TimestampSchema,
    dancer: StageDancerSchema,
  }),
  z.object({
    type: z.literal('stage:dancer-move'),
    at: TimestampSchema,
    dancerId: NonEmptyStringSchema,
    slotId: NonEmptyStringSchema,
    zone: z.enum(DANCER_ZONES),
    position: NormalizedPositionSchema,
  }),
  z.object({
    type: z.literal('stage:dancer-remove'),
    at: TimestampSchema,
    dancerId: NonEmptyStringSchema,
    reason: z.enum(DANCER_REMOVE_REASONS),
  }),
  z.object({
    type: z.literal('stage:gift-effect'),
    at: TimestampSchema,
    userId: NonEmptyStringSchema,
    dancerId: z.string().optional(),
    giftId: z.string().optional(),
    giftName: z.string(),
    /** Diamonds credited by THIS gift after deduplication, not the user's running total. */
    diamonds: NonNegativeIntSchema,
    tierId: NonEmptyStringSchema,
    effectPreset: NonEmptyStringSchema,
    durationMs: NonNegativeIntSchema,
    priority: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('stage:ranking-change'),
    at: TimestampSchema,
    entries: z.array(StageRankingEntrySchema),
    /** Users that entered the VIP zone with this change (Blueprint §24). */
    promoted: z.array(NonEmptyStringSchema),
    /** Users that dropped out of the VIP zone. */
    demoted: z.array(NonEmptyStringSchema),
  }),
  z.object({
    type: z.literal('stage:spotlight-start'),
    at: TimestampSchema,
    userId: NonEmptyStringSchema,
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('stage:spotlight-end'),
    at: TimestampSchema,
    userId: NonEmptyStringSchema,
  }),
  z.object({
    type: z.literal('stage:announcement'),
    at: TimestampSchema,
    text: z.string(),
    level: z.enum(['info', 'celebration', 'warning']),
    durationMs: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('stage:party-goal'),
    at: TimestampSchema,
    state: PartyGoalStateSchema,
    completed: z.boolean(),
  }),

  // ── Auto Host visuals (Task 10 §8) ──────────────────────────────────────────────────────────
  // Semantic variants only. STAGE resolves them to DA-VISUAL-R3 artwork through the theme, so a
  // revision swap never touches these events. `overlayId` is assigned by the runtime so repeated
  // reactions are addressable and self-cleaning instead of leaking display objects.
  z.object({
    type: z.literal('stage:host-reaction'),
    at: TimestampSchema,
    overlayId: NonEmptyStringSchema,
    ruleId: NonEmptyStringSchema,
    variant: AutoHostReactionSchema,
    durationMs: NonNegativeIntSchema,
    /** Anchors the overlay near that viewer's dancer when they are on stage. */
    userId: z.string().optional(),
  }),
  z.object({
    type: z.literal('stage:host-bubble'),
    at: TimestampSchema,
    overlayId: NonEmptyStringSchema,
    ruleId: NonEmptyStringSchema,
    variant: AutoHostBubbleSchema,
    durationMs: NonNegativeIntSchema,
    userId: z.string().optional(),
  }),
  /**
   * Auto Host celebration visual. Deliberately NOT `stage:gift-effect`: it carries no diamonds,
   * no tier and no score, so it can never masquerade as a gift (Task 10 §10.10).
   */
  z.object({
    type: z.literal('stage:host-effect'),
    at: TimestampSchema,
    overlayId: NonEmptyStringSchema,
    ruleId: NonEmptyStringSchema,
    slot: AutoHostEffectSlotSchema,
    durationMs: NonNegativeIntSchema,
    userId: z.string().optional(),
  }),
]);

export type StageEvent = z.infer<typeof StageEventSchema>;

export type StageEventType = StageEvent['type'];

export type StageEventOf<T extends StageEventType> = Extract<StageEvent, { type: T }>;
