/**
 * Deterministic fixtures for engine tests.
 *
 * Exported (not test-only) so Task 03/08 integration tests can build the same normalized events
 * without duplicating shapes.
 */

import type {
  CommentEvent,
  GiftEvent,
  LikeEvent,
  LiveEvent,
  LiveUser,
} from '@dance-arena/contracts';
import { normalizeCommentText } from '@dance-arena/contracts';

export function makeUser(id: string, overrides: Partial<LiveUser> = {}): LiveUser {
  return {
    platformUserId: id,
    uniqueId: `handle_${id}`,
    nickname: `User ${id}`,
    avatarUrl: `https://cdn.test/${id}.webp`,
    ...overrides,
  };
}

export function comment(user: LiveUser, text: string, at: number): CommentEvent {
  return {
    version: 1,
    type: 'comment',
    timestamp: at,
    user,
    comment: text,
    normalizedComment: normalizeCommentText(text),
  };
}

export interface GiftOptions {
  readonly name?: string;
  readonly id?: string;
  readonly diamondValue: number;
  readonly repeatCount?: number;
  readonly streak?: boolean;
  readonly streakEnded?: boolean;
  readonly transactionId?: string;
}

export function gift(user: LiveUser, at: number, options: GiftOptions): GiftEvent {
  const repeatCount = options.repeatCount ?? 1;

  return {
    version: 1,
    type: 'gift',
    timestamp: at,
    user,
    gift: {
      name: options.name ?? 'Rose',
      diamondValue: options.diamondValue,
      repeatCount,
      totalDiamonds: options.diamondValue * repeatCount,
      streak: options.streak ?? false,
      streakEnded: options.streakEnded ?? true,
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.transactionId === undefined ? {} : { transactionId: options.transactionId }),
    },
  };
}

export function follow(user: LiveUser, at: number): LiveEvent {
  return { version: 1, type: 'follow', timestamp: at, user };
}

export function share(user: LiveUser, at: number): LiveEvent {
  return { version: 1, type: 'share', timestamp: at, user };
}

export function join(user: LiveUser, at: number): LiveEvent {
  return { version: 1, type: 'join', timestamp: at, user };
}

export function like(user: LiveUser, at: number, likeCount = 1): LikeEvent {
  return { version: 1, type: 'like', timestamp: at, user, likeCount };
}
