/**
 * Canonical game state (Blueprint §15–§25).
 *
 * This state is owned by the Core Engine. CONTROL and STAGE receive projections of it and may
 * never treat their copy as the source of truth.
 */

import { z } from 'zod';

import {
  NonEmptyStringSchema,
  NonNegativeIntSchema,
  NormalizedPositionSchema,
  TimestampSchema,
} from '../common.js';

// ── Session ───────────────────────────────────────────────────────────────────────────────────

export const SESSION_STATUSES = ['idle', 'active', 'ended'] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SessionStateSchema = z.object({
  sessionId: NonEmptyStringSchema,
  status: z.enum(SESSION_STATUSES),
  startedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionCountersSchema = z.object({
  totalDiamonds: NonNegativeIntSchema,
  giftCount: NonNegativeIntSchema,
  commentCount: NonNegativeIntSchema,
  followCount: NonNegativeIntSchema,
  shareCount: NonNegativeIntSchema,
  joinCount: NonNegativeIntSchema,
  likeCount: NonNegativeIntSchema,
  eventCount: NonNegativeIntSchema,
});

export type SessionCounters = z.infer<typeof SessionCountersSchema>;

// ── User (§16) ────────────────────────────────────────────────────────────────────────────────

export const UserStateSchema = z.object({
  /** Always the platform user id. Never a nickname (Blueprint §10/§16). */
  id: NonEmptyStringSchema,
  uniqueId: z.string().optional(),
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  totalDiamonds: NonNegativeIntSchema,
  giftCount: NonNegativeIntSchema,
  follow: z.boolean(),
  lastSeenAt: TimestampSchema,
  lastGiftAt: TimestampSchema.optional(),
  activeDancerId: z.string().optional(),
  queueEntryId: z.string().optional(),
});

export type UserState = z.infer<typeof UserStateSchema>;

// ── Queue (§19) ───────────────────────────────────────────────────────────────────────────────

export const QueueEntrySchema = z.object({
  id: NonEmptyStringSchema,
  userId: NonEmptyStringSchema,
  joinedAt: TimestampSchema,
  priorityScore: z.number(),
  diamondsWhileWaiting: NonNegativeIntSchema,
  lastGiftAt: TimestampSchema.optional(),
});

export type QueueEntry = z.infer<typeof QueueEntrySchema>;

// ── Dancer (§21) ──────────────────────────────────────────────────────────────────────────────

export const DANCER_STATUSES = ['entering', 'active', 'leaving'] as const;

export type DancerStatus = (typeof DANCER_STATUSES)[number];

export const DANCER_ZONES = ['normal', 'vip'] as const;

export type DancerZone = (typeof DANCER_ZONES)[number];

export const DancerStateSchema = z.object({
  dancerId: NonEmptyStringSchema,
  /** A dancer is an entity of its own; it merely references a user (Blueprint §21). */
  userId: NonEmptyStringSchema,
  slotId: NonEmptyStringSchema,
  zone: z.enum(DANCER_ZONES),
  costumeId: NonEmptyStringSchema,
  position: NormalizedPositionSchema,
  status: z.enum(DANCER_STATUSES),
  spawnedAt: TimestampSchema,
});

export type DancerState = z.infer<typeof DancerStateSchema>;

// ── Ranking (§23) ─────────────────────────────────────────────────────────────────────────────

export const RankingEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: NonEmptyStringSchema,
  totalDiamonds: NonNegativeIntSchema,
  previousRank: z.number().int().positive().optional(),
});

export type RankingEntry = z.infer<typeof RankingEntrySchema>;

export const RankingStateSchema = z.object({
  entries: z.array(RankingEntrySchema),
  updatedAt: TimestampSchema,
});

export type RankingState = z.infer<typeof RankingStateSchema>;

// ── VIP (§24) ─────────────────────────────────────────────────────────────────────────────────

export const VipStateSchema = z.object({
  /** Ordered best-first; derived from ranking, never set by a renderer. */
  userIds: z.array(NonEmptyStringSchema),
  capacity: NonNegativeIntSchema,
});

export type VipState = z.infer<typeof VipStateSchema>;

// ── Party goal (§25) ──────────────────────────────────────────────────────────────────────────

export const PartyGoalStateSchema = z.object({
  enabled: z.boolean(),
  current: NonNegativeIntSchema,
  target: NonNegativeIntSchema,
  completedCount: NonNegativeIntSchema,
});

export type PartyGoalState = z.infer<typeof PartyGoalStateSchema>;

// ── Spotlight ─────────────────────────────────────────────────────────────────────────────────

export const SpotlightStateSchema = z.object({
  userId: NonEmptyStringSchema,
  startedAt: TimestampSchema,
  endsAt: TimestampSchema,
  reason: z.string(),
});

export type SpotlightState = z.infer<typeof SpotlightStateSchema>;

// ── Aggregate (§15) ───────────────────────────────────────────────────────────────────────────

export const GameStateSchema = z.object({
  session: SessionStateSchema,
  users: z.record(NonEmptyStringSchema, UserStateSchema),
  dancers: z.array(DancerStateSchema),
  queue: z.array(QueueEntrySchema),
  ranking: RankingStateSchema,
  vip: VipStateSchema,
  partyGoal: PartyGoalStateSchema,
  spotlight: SpotlightStateSchema.optional(),
  counters: SessionCountersSchema,
});

export type GameState = z.infer<typeof GameStateSchema>;

/** Snapshot delivered to CONTROL on connect/reload (Blueprint §61). */
export const GameSnapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: TimestampSchema,
  state: GameStateSchema,
});

export type GameSnapshot = z.infer<typeof GameSnapshotSchema>;

/** Aggregated numbers CONTROL shows without recomputing anything itself (Blueprint §37). */
export const SessionStatsSchema = z.object({
  session: SessionStateSchema,
  counters: SessionCountersSchema,
  activeDancers: NonNegativeIntSchema,
  queueLength: NonNegativeIntSchema,
  topSupporter: RankingEntrySchema.optional(),
  partyGoal: PartyGoalStateSchema,
});

export type SessionStats = z.infer<typeof SessionStatsSchema>;
