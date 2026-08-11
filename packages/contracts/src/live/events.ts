/**
 * Normalized Dance Arena live events — contract v1 (Blueprint §9–§12).
 *
 * This is the ONLY event shape the Core Engine understands. Provider payloads (EulerStream, mock,
 * replay) stop at the normalizer; nothing downstream may know a provider schema.
 */

import { z } from 'zod';

import { ContractsVersionSchema, NonNegativeIntSchema, TimestampSchema } from '../common.js';
import { LiveUserSchema } from './user.js';

export const LIVE_EVENT_TYPES = ['comment', 'gift', 'follow', 'share', 'join', 'like'] as const;

export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];

const baseEventShape = {
  version: ContractsVersionSchema,
  timestamp: TimestampSchema,
  user: LiveUserSchema,
};

export const BaseLiveEventSchema = z.object({
  ...baseEventShape,
  type: z.enum(LIVE_EVENT_TYPES),
});

export type BaseLiveEvent = z.infer<typeof BaseLiveEventSchema>;

// ── Comment ───────────────────────────────────────────────────────────────────────────────────

export const CommentEventSchema = z.object({
  ...baseEventShape,
  type: z.literal('comment'),
  comment: z.string(),
  /**
   * Uppercased, diacritic-stripped, trimmed form of `comment` (Blueprint §11): "VÀO", "vao",
   * " Vào " all normalize to "VAO". Produced by the normalizer so command parsing never has to
   * redo locale-sensitive work.
   */
  normalizedComment: z.string(),
});

export type CommentEvent = z.infer<typeof CommentEventSchema>;

// ── Gift ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Gift payload (Blueprint §12).
 *
 * No tier logic lives here — tiers are engine configuration (Blueprint §26), not schema.
 *
 * Streak semantics: while a streak is open the provider re-sends the SAME gift with a growing
 * `repeatCount` (x1, x2, x3, x4). `totalDiamonds` is therefore cumulative-for-the-streak, not an
 * increment. Deduplication happens in the engine (Blueprint §13), never here.
 */
export const GiftPayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  diamondValue: NonNegativeIntSchema,
  repeatCount: NonNegativeIntSchema,
  totalDiamonds: NonNegativeIntSchema,
  /** True while the combo is still open. */
  streak: z.boolean(),
  /** True on the final event of a combo. */
  streakEnded: z.boolean(),
  /** Provider transaction id — the preferred deduplication key (Blueprint §13). */
  transactionId: z.string().optional(),
  imageUrl: z.string().optional(),
});

export type GiftPayload = z.infer<typeof GiftPayloadSchema>;

export const GiftEventSchema = z.object({
  ...baseEventShape,
  type: z.literal('gift'),
  gift: GiftPayloadSchema,
});

export type GiftEvent = z.infer<typeof GiftEventSchema>;

// ── Follow / Share / Join / Like ───────────────────────────────────────────────────────────────

export const FollowEventSchema = z.object({
  ...baseEventShape,
  type: z.literal('follow'),
});

export type FollowEvent = z.infer<typeof FollowEventSchema>;

export const ShareEventSchema = z.object({
  ...baseEventShape,
  type: z.literal('share'),
});

export type ShareEvent = z.infer<typeof ShareEventSchema>;

export const JoinEventSchema = z.object({
  ...baseEventShape,
  type: z.literal('join'),
});

export type JoinEvent = z.infer<typeof JoinEventSchema>;

export const LikeEventSchema = z.object({
  ...baseEventShape,
  type: z.literal('like'),
  /** Likes delivered by this event. */
  likeCount: NonNegativeIntSchema,
  /** Room total when the provider reports it. */
  totalLikeCount: NonNegativeIntSchema.optional(),
});

export type LikeEvent = z.infer<typeof LikeEventSchema>;

// ── Union ─────────────────────────────────────────────────────────────────────────────────────

export const LiveEventSchema = z.discriminatedUnion('type', [
  CommentEventSchema,
  GiftEventSchema,
  FollowEventSchema,
  ShareEventSchema,
  JoinEventSchema,
  LikeEventSchema,
]);

export type LiveEvent = z.infer<typeof LiveEventSchema>;

export function isCommentEvent(event: LiveEvent): event is CommentEvent {
  return event.type === 'comment';
}

export function isGiftEvent(event: LiveEvent): event is GiftEvent {
  return event.type === 'gift';
}

/**
 * Normalizes comment text for command matching (Blueprint §11).
 *
 * Uppercase → strip Vietnamese/Unicode diacritics → collapse whitespace. Exported from contracts
 * so the normalizer and the engine's command parser can never disagree on what "VÀO" means.
 */
export function normalizeCommentText(comment: string): string {
  return comment
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}
