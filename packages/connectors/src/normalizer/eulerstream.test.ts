import type { RawLiveEvent } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { EulerStreamNormalizer } from './eulerstream.js';

const normalizer = new EulerStreamNormalizer();

function raw(kind: string, payload: unknown, receivedAt = 1_700_000_000_000): RawLiveEvent {
  return { provider: 'eulerstream', kind, receivedAt, payload };
}

const user = {
  userId: '6789012345',
  uniqueId: 'dancer_one',
  nickname: 'Dancer One',
  profilePictureUrl: 'https://cdn.tiktok/avatar.webp',
};

describe('comment normalization', () => {
  it('maps a chat frame to a CommentEvent with a normalized command token', () => {
    const result = normalizer.normalize(raw('chat', { user, comment: ' Vào ' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.event).toMatchObject({
      version: 1,
      type: 'comment',
      comment: ' Vào ',
      normalizedComment: 'VAO',
      user: {
        platformUserId: '6789012345',
        uniqueId: 'dancer_one',
        nickname: 'Dancer One',
        avatarUrl: 'https://cdn.tiktok/avatar.webp',
      },
    });
  });

  it('accepts the flat payload variant', () => {
    const result = normalizer.normalize(
      raw('comment', { userId: 999, nickname: 'Flat User', content: 'GO' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.event.user.platformUserId).toBe('999');
    expect(result.event.type === 'comment' && result.event.normalizedComment).toBe('GO');
  });
});

describe('gift normalization (Blueprint §12)', () => {
  it('reads the snake_case nested variant', () => {
    const result = normalizer.normalize(
      raw('gift', {
        user,
        giftId: 5655,
        giftName: 'Rose',
        gift: { diamond_count: 1, repeat_count: 3, repeat_end: 0, gift_type: 1 },
        msgId: 'msg-1',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.event.type !== 'gift') return;

    expect(result.event.gift).toMatchObject({
      id: '5655',
      name: 'Rose',
      diamondValue: 1,
      repeatCount: 3,
      totalDiamonds: 3,
      streak: true,
      streakEnded: false,
      transactionId: 'msg-1',
    });
  });

  it('reads the camelCase flat variant', () => {
    const result = normalizer.normalize(
      raw('gift', {
        user,
        giftId: 'galaxy',
        giftName: 'Galaxy',
        diamondCount: 500,
        repeatCount: 1,
        repeatEnd: true,
        giftType: 1,
        msgId: 'msg-2',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.event.type !== 'gift') return;

    expect(result.event.gift).toMatchObject({
      diamondValue: 500,
      repeatCount: 1,
      totalDiamonds: 500,
      streak: false,
      streakEnded: true,
    });
  });

  it('treats a non-streakable gift type as a closed one-shot', () => {
    const result = normalizer.normalize(
      raw('gift', { user, giftName: 'Universe', diamondCount: 1_500, giftType: 2, repeatCount: 1 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.event.type !== 'gift') return;

    expect(result.event.gift.streak).toBe(false);
    expect(result.event.gift.streakEnded).toBe(true);
  });

  it('preserves the data deduplication needs across a whole combo', () => {
    const combo = [1, 2, 3, 4].map((repeatCount) =>
      normalizer.normalize(
        raw('gift', {
          user,
          giftName: 'Rose',
          diamondCount: 10,
          repeatCount,
          repeatEnd: repeatCount === 4,
          giftType: 1,
          msgId: 'combo-1',
        }),
      ),
    );

    const gifts = combo.map((result) =>
      result.ok && result.event.type === 'gift' ? result.event.gift : undefined,
    );

    expect(gifts.map((gift) => gift?.repeatCount)).toEqual([1, 2, 3, 4]);
    expect(gifts.map((gift) => gift?.streakEnded)).toEqual([false, false, false, true]);
    // Same transaction id across the combo is what lets the engine credit deltas, not sums.
    expect(new Set(gifts.map((gift) => gift?.transactionId)).size).toBe(1);
  });

  it('falls back to diamondValue × repeatCount when no total is reported', () => {
    const result = normalizer.normalize(
      raw('gift', { user, giftName: 'Rose', diamondCount: 7, repeatCount: 3, giftType: 2 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.event.type !== 'gift') return;

    expect(result.event.gift.totalDiamonds).toBe(21);
  });

  it('clamps a negative diamond count instead of poisoning the engine', () => {
    const result = normalizer.normalize(
      raw('gift', { user, giftName: 'Broken', diamondCount: -50, repeatCount: 1 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.event.type !== 'gift') return;

    expect(result.event.gift.diamondValue).toBe(0);
  });
});

describe('social, join and like normalization', () => {
  it('splits social frames into follow and share', () => {
    const follow = normalizer.normalize(
      raw('social', { user, displayType: 'pm_main_follow_message_viewer_2' }),
    );
    const share = normalizer.normalize(
      raw('social', { user, displayType: 'pm_mt_guidance_share' }),
    );

    expect(follow.ok && follow.event.type).toBe('follow');
    expect(share.ok && share.event.type).toBe('share');
  });

  it('ignores a social frame that identifies neither follow nor share', () => {
    const result = normalizer.normalize(raw('social', { user, displayType: 'pm_something_else' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('ignored');
  });

  it('maps member frames to join', () => {
    const result = normalizer.normalize(raw('member', { user }));

    expect(result.ok && result.event.type).toBe('join');
  });

  it('maps like frames with counts', () => {
    const result = normalizer.normalize(raw('like', { user, likeCount: 5, totalLikeCount: 4_242 }));

    expect(result.ok).toBe(true);
    if (!result.ok || result.event.type !== 'like') return;

    expect(result.event.likeCount).toBe(5);
    expect(result.event.totalLikeCount).toBe(4_242);
  });
});

describe('identity and robustness', () => {
  it('REJECTS a payload without a stable user id instead of falling back to nickname', () => {
    const result = normalizer.normalize(
      raw('chat', { user: { nickname: 'Anonymous' }, comment: 'GO' }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe('invalid');
    expect(result.detail).toContain('user id');
  });

  it('keeps two users with the same nickname separate', () => {
    const first = normalizer.normalize(
      raw('chat', { user: { userId: 'a', nickname: 'Same' }, comment: 'hi' }),
    );
    const second = normalizer.normalize(
      raw('chat', { user: { userId: 'b', nickname: 'Same' }, comment: 'hi' }),
    );

    expect(first.ok && first.event.user.platformUserId).toBe('a');
    expect(second.ok && second.event.user.platformUserId).toBe('b');
  });

  it('reports a non-object payload as invalid without throwing', () => {
    expect(normalizer.normalize(raw('chat', 'not-an-object')).ok).toBe(false);
    expect(normalizer.normalize(raw('chat', null)).ok).toBe(false);
    expect(normalizer.normalize(raw('gift', 42)).ok).toBe(false);
  });

  it('ignores non-gameplay frames quietly', () => {
    for (const kind of ['roomUser', 'streamEnd', 'heartbeat', 'WebcastRoomUserSeqMessage']) {
      const result = normalizer.normalize(raw(kind, { viewerCount: 100 }));

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe('ignored');
    }
  });

  it('ignores an unmapped message kind', () => {
    const result = normalizer.normalize(raw('WebcastSomethingNew', { user }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('ignored');
  });

  it('normalizes provider timestamps in seconds to milliseconds', () => {
    const result = normalizer.normalize(
      raw('chat', { user, comment: 'hi', createTime: 1_700_000_000 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.timestamp).toBe(1_700_000_000_000);
  });

  it('falls back to the receive time when the provider omits a timestamp', () => {
    const result = normalizer.normalize(raw('chat', { user, comment: 'hi' }, 1_234_567_890));

    expect(result.ok && result.event.timestamp).toBe(1_234_567_890);
  });

  it('does not leak raw provider fields downstream', () => {
    const result = normalizer.normalize(
      raw('chat', { user, comment: 'hi', internalDebugBlob: { secret: 'x' } }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.event)).not.toContain('internalDebugBlob');
  });
});
