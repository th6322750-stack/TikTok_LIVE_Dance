import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '../common.js';
import {
  CommentEventSchema,
  GiftEventSchema,
  isCommentEvent,
  isGiftEvent,
  LikeEventSchema,
  LiveEventSchema,
  normalizeCommentText,
  type LiveEvent,
} from './events.js';
import { displayNameOf, LiveUserSchema } from './user.js';

const user = {
  platformUserId: 'user-123',
  uniqueId: 'dancer_one',
  nickname: 'Dancer One',
  avatarUrl: 'https://cdn.example/avatar.webp',
};

const commentFixture = {
  version: 1,
  type: 'comment',
  timestamp: 1_700_000_000_000,
  user,
  comment: ' Vào ',
  normalizedComment: 'VAO',
};

const giftFixture = {
  version: 1,
  type: 'gift',
  timestamp: 1_700_000_001_000,
  user,
  gift: {
    id: 'rose',
    name: 'Rose',
    diamondValue: 1,
    repeatCount: 4,
    totalDiamonds: 4,
    streak: false,
    streakEnded: true,
    transactionId: 'tx-1',
  },
};

describe('LiveUser identity', () => {
  it('accepts a user identified by platform id', () => {
    expect(LiveUserSchema.parse(user).platformUserId).toBe('user-123');
  });

  it('rejects a user without a platform id — nickname is never an identity', () => {
    const result = LiveUserSchema.safeParse({ nickname: 'Dancer One' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('platformUserId'))).toBe(true);
    }
  });

  it('rejects an empty platform id', () => {
    expect(LiveUserSchema.safeParse({ ...user, platformUserId: '' }).success).toBe(false);
  });

  it('falls back through nickname → uniqueId → id for display only', () => {
    expect(displayNameOf(user)).toBe('Dancer One');
    expect(displayNameOf({ ...user, nickname: '   ' })).toBe('dancer_one');
    expect(displayNameOf({ platformUserId: 'user-9', nickname: '' })).toBe('user-9');
  });
});

describe('normalizeCommentText', () => {
  it('maps every JOIN alias spelling to the same token', () => {
    expect(normalizeCommentText('VÀO')).toBe('VAO');
    expect(normalizeCommentText('vao')).toBe('VAO');
    expect(normalizeCommentText(' Vào ')).toBe('VAO');
    expect(normalizeCommentText('vÀo')).toBe('VAO');
  });

  it('handles Vietnamese đ and collapses inner whitespace', () => {
    expect(normalizeCommentText('đi   xuống')).toBe('DI XUONG');
    expect(normalizeCommentText('Tham   gia')).toBe('THAM GIA');
  });

  it('leaves non-alias text intact but normalized', () => {
    expect(normalizeCommentText('xin chào mọi người')).toBe('XIN CHAO MOI NGUOI');
  });
});

describe('live event schemas', () => {
  it('parses valid comment and gift fixtures', () => {
    expect(CommentEventSchema.parse(commentFixture).normalizedComment).toBe('VAO');
    expect(GiftEventSchema.parse(giftFixture).gift.totalDiamonds).toBe(4);
  });

  it('rejects a wrong contract version', () => {
    const result = CommentEventSchema.safeParse({ ...commentFixture, version: 2 });

    expect(result.success).toBe(false);
  });

  it('rejects negative diamonds and non-integer counts', () => {
    expect(
      GiftEventSchema.safeParse({
        ...giftFixture,
        gift: { ...giftFixture.gift, diamondValue: -1 },
      }).success,
    ).toBe(false);

    expect(
      GiftEventSchema.safeParse({
        ...giftFixture,
        gift: { ...giftFixture.gift, repeatCount: 1.5 },
      }).success,
    ).toBe(false);
  });

  it('reports a useful path for a malformed nested field', () => {
    const result = GiftEventSchema.safeParse({
      ...giftFixture,
      gift: { ...giftFixture.gift, name: 42 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['gift', 'name']);
    }
  });

  it('requires likeCount on like events', () => {
    const base = { version: 1, type: 'like', timestamp: 1, user };

    expect(LikeEventSchema.safeParse(base).success).toBe(false);
    expect(LikeEventSchema.safeParse({ ...base, likeCount: 3 }).success).toBe(true);
  });
});

describe('LiveEvent union discrimination', () => {
  it('discriminates by type and narrows correctly', () => {
    const parsed: LiveEvent = LiveEventSchema.parse(giftFixture);

    expect(isGiftEvent(parsed)).toBe(true);
    expect(isCommentEvent(parsed)).toBe(false);
    if (isGiftEvent(parsed)) {
      expect(parsed.gift.name).toBe('Rose');
    }
  });

  it('rejects an unknown event type', () => {
    const result = LiveEventSchema.safeParse({ ...commentFixture, type: 'superchat' });

    expect(result.success).toBe(false);
  });

  it('rejects a comment payload declared as a gift', () => {
    const result = LiveEventSchema.safeParse({ ...commentFixture, type: 'gift' });

    expect(result.success).toBe(false);
  });

  it('survives a JSON serialization roundtrip', () => {
    const parsed = LiveEventSchema.parse(giftFixture);
    const roundtripped = LiveEventSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(roundtripped).toEqual(parsed);
  });

  it('strips unknown provider fields instead of leaking them downstream', () => {
    const parsed = CommentEventSchema.parse({ ...commentFixture, __rawProviderBlob: { a: 1 } });

    expect(parsed).not.toHaveProperty('__rawProviderBlob');
    expect(parsed.version).toBe(CONTRACTS_SCHEMA_VERSION);
  });
});
