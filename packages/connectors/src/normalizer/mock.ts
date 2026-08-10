/**
 * Mock provider normalizer.
 *
 * The simulator is NOT allowed to hand the engine ready-made normalized events — that would skip
 * the very boundary we want under test (Blueprint §53). It emits its own provider-shaped payload
 * which this adapter validates and converts, exactly like the EulerStream adapter does.
 */

import {
  normalizeCommentText,
  type LiveEvent,
  type LiveUser,
  type RawLiveEvent,
} from '@dance-arena/contracts';
import { z } from 'zod';

import { ignored, invalid, type EventNormalizer, type NormalizeResult } from './types.js';

const MockUserSchema = z.object({
  userId: z.string().min(1),
  handle: z.string().optional(),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
});

const MockCommentSchema = z.object({
  kind: z.literal('comment'),
  at: z.number().int().nonnegative(),
  user: MockUserSchema,
  text: z.string(),
});

const MockGiftSchema = z.object({
  kind: z.literal('gift'),
  at: z.number().int().nonnegative(),
  user: MockUserSchema,
  giftId: z.string().optional(),
  giftName: z.string(),
  diamonds: z.number().int().nonnegative(),
  repeatCount: z.number().int().positive().optional(),
  streak: z.boolean().optional(),
  streakEnded: z.boolean().optional(),
  transactionId: z.string().optional(),
  giftImage: z.string().optional(),
});

const MockSimpleSchema = z.object({
  kind: z.enum(['follow', 'share', 'join']),
  at: z.number().int().nonnegative(),
  user: MockUserSchema,
});

const MockLikeSchema = z.object({
  kind: z.literal('like'),
  at: z.number().int().nonnegative(),
  user: MockUserSchema,
  likes: z.number().int().nonnegative().optional(),
  totalLikes: z.number().int().nonnegative().optional(),
});

export const MockPayloadSchema = z.discriminatedUnion('kind', [
  MockCommentSchema,
  MockGiftSchema,
  MockSimpleSchema,
  MockLikeSchema,
]);

export type MockPayload = z.infer<typeof MockPayloadSchema>;

type MockUser = z.infer<typeof MockUserSchema>;

/** Identity comes from the provider user id — never from the display name (Blueprint §10). */
function toLiveUser(user: MockUser): LiveUser {
  return {
    platformUserId: user.userId,
    nickname: user.displayName ?? user.handle ?? user.userId,
    ...(user.handle === undefined ? {} : { uniqueId: user.handle }),
    ...(user.avatar === undefined ? {} : { avatarUrl: user.avatar }),
  };
}

export class MockNormalizer implements EventNormalizer {
  readonly provider = 'mock';

  normalize(raw: RawLiveEvent): NormalizeResult {
    if (raw.provider !== 'mock' && raw.provider !== 'replay') {
      return ignored(`unsupported provider ${raw.provider}`);
    }

    const parsed = MockPayloadSchema.safeParse(raw.payload);
    if (!parsed.success) {
      return invalid(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const payload = parsed.data;
    const user = toLiveUser(payload.user);

    switch (payload.kind) {
      case 'comment': {
        const event: LiveEvent = {
          version: 1,
          type: 'comment',
          timestamp: payload.at,
          user,
          comment: payload.text,
          normalizedComment: normalizeCommentText(payload.text),
        };
        return { ok: true, event };
      }

      case 'gift': {
        const repeatCount = payload.repeatCount ?? 1;
        const event: LiveEvent = {
          version: 1,
          type: 'gift',
          timestamp: payload.at,
          user,
          gift: {
            name: payload.giftName,
            diamondValue: payload.diamonds,
            repeatCount,
            totalDiamonds: payload.diamonds * repeatCount,
            streak: payload.streak ?? false,
            streakEnded: payload.streakEnded ?? true,
            ...(payload.giftId === undefined ? {} : { id: payload.giftId }),
            ...(payload.transactionId === undefined
              ? {}
              : { transactionId: payload.transactionId }),
            ...(payload.giftImage === undefined ? {} : { imageUrl: payload.giftImage }),
          },
        };
        return { ok: true, event };
      }

      case 'like': {
        const event: LiveEvent = {
          version: 1,
          type: 'like',
          timestamp: payload.at,
          user,
          likeCount: payload.likes ?? 1,
          ...(payload.totalLikes === undefined ? {} : { totalLikeCount: payload.totalLikes }),
        };
        return { ok: true, event };
      }

      default: {
        const event: LiveEvent = {
          version: 1,
          type: payload.kind,
          timestamp: payload.at,
          user,
        };
        return { ok: true, event };
      }
    }
  }
}
