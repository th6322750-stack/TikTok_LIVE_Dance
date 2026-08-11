/**
 * Blocker 3 regression — a finalized transaction must never be credited twice.
 */

import type { GiftPayload } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { GiftDeduplicationService } from './giftDeduplication.js';

function gift(overrides: Partial<GiftPayload> = {}): GiftPayload {
  const repeatCount = overrides.repeatCount ?? 1;

  return {
    name: 'Rose',
    id: 'rose',
    diamondValue: 10,
    repeatCount,
    totalDiamonds: 10 * repeatCount,
    streak: false,
    streakEnded: true,
    ...overrides,
  };
}

describe('finalized transaction ledger', () => {
  it('credits a re-delivered FINAL streak frame zero the second time', () => {
    const service = new GiftDeduplicationService(30_000);
    const final = gift({ repeatCount: 4, streak: false, streakEnded: true, transactionId: 'tx-1' });

    expect(service.credit({ userId: 'u1', gift: final, at: 1_000 }).diamonds).toBe(40);

    // Same final frame replayed after a reconnect.
    const replay = service.credit({ userId: 'u1', gift: final, at: 5_000 });
    expect(replay.diamonds).toBe(0);
    expect(replay.duplicateOf).toBe('finalized-transaction');
  });

  it('credits a re-delivered ONE-SHOT transaction zero the second time', () => {
    const service = new GiftDeduplicationService(30_000);
    const oneShot = gift({ diamondValue: 500, transactionId: 'tx-oneshot' });

    expect(service.credit({ userId: 'u1', gift: oneShot, at: 1_000 }).diamonds).toBe(500);
    expect(service.credit({ userId: 'u1', gift: oneShot, at: 2_000 }).diamonds).toBe(0);
    expect(service.credit({ userId: 'u1', gift: oneShot, at: 90_000 }).diamonds).toBe(0);
  });

  it('counts the same gift again under a NEW transaction id', () => {
    const service = new GiftDeduplicationService(30_000);

    expect(
      service.credit({ userId: 'u1', gift: gift({ transactionId: 'tx-a' }), at: 1_000 }).diamonds,
    ).toBe(10);
    expect(
      service.credit({ userId: 'u1', gift: gift({ transactionId: 'tx-b' }), at: 1_100 }).diamonds,
    ).toBe(10);
  });

  it('completes a whole combo then ignores every replay of it', () => {
    const service = new GiftDeduplicationService(30_000);
    const combo = (repeatCount: number): GiftPayload =>
      gift({
        repeatCount,
        streak: repeatCount < 4,
        streakEnded: repeatCount === 4,
        transactionId: 'tx-combo',
      });

    let total = 0;
    for (let repeat = 1; repeat <= 4; repeat += 1) {
      total += service.credit({
        userId: 'u1',
        gift: combo(repeat),
        at: 1_000 + repeat * 100,
      }).diamonds;
    }
    expect(total).toBe(40);

    // The provider replays the entire combo after a reconnect.
    for (let repeat = 1; repeat <= 4; repeat += 1) {
      expect(
        service.credit({ userId: 'u1', gift: combo(repeat), at: 9_000 + repeat }).diamonds,
      ).toBe(0);
    }
  });

  it('credits only genuinely new repeats if a closed combo grows', () => {
    const service = new GiftDeduplicationService(30_000);

    service.credit({
      userId: 'u1',
      gift: gift({ repeatCount: 2, streakEnded: true, transactionId: 'tx-grow' }),
      at: 1_000,
    });

    const late = service.credit({
      userId: 'u1',
      gift: gift({ repeatCount: 5, streakEnded: true, transactionId: 'tx-grow' }),
      at: 2_000,
    });

    expect(late.diamonds).toBe(30);
  });

  it('forgets a finalized transaction after its TTL', () => {
    const service = new GiftDeduplicationService(30_000, { finalizedTtlMs: 1_000 });
    const oneShot = gift({ transactionId: 'tx-ttl' });

    expect(service.credit({ userId: 'u1', gift: oneShot, at: 1_000 }).diamonds).toBe(10);
    expect(service.credit({ userId: 'u1', gift: oneShot, at: 1_500 }).diamonds).toBe(0);
    // Past the TTL the id is no longer remembered, so it is treated as a fresh transaction.
    expect(service.credit({ userId: 'u1', gift: oneShot, at: 20_000 }).diamonds).toBe(10);
  });
});

describe('ledger stays bounded', () => {
  it('evicts the oldest entries beyond the capacity', () => {
    const service = new GiftDeduplicationService(30_000, { finalizedCapacity: 10 });

    for (let index = 0; index < 50; index += 1) {
      service.credit({
        userId: 'u1',
        gift: gift({ transactionId: `tx-${index}` }),
        at: 1_000 + index,
      });
    }

    expect(service.finalizedCount).toBeLessThanOrEqual(10);
  });

  it('prunes expired records', () => {
    const service = new GiftDeduplicationService(1_000, { finalizedTtlMs: 1_000 });

    service.credit({ userId: 'u1', gift: gift({ transactionId: 'tx-old' }), at: 1_000 });
    expect(service.finalizedCount).toBe(1);

    service.prune(100_000);

    expect(service.finalizedCount).toBe(0);
    expect(service.openStreakCount).toBe(0);
  });

  it('clears both maps on reset', () => {
    const service = new GiftDeduplicationService(30_000);

    service.credit({ userId: 'u1', gift: gift({ transactionId: 'tx-1' }), at: 1_000 });
    service.credit({
      userId: 'u1',
      gift: gift({ repeatCount: 1, streak: true, streakEnded: false, transactionId: 'tx-2' }),
      at: 1_000,
    });

    service.reset();

    expect(service.finalizedCount).toBe(0);
    expect(service.openStreakCount).toBe(0);
  });
});

describe('providers without a transaction id', () => {
  it('still dedupes an open streak inside the window', () => {
    const service = new GiftDeduplicationService(30_000);
    const streak = (repeatCount: number): GiftPayload =>
      gift({ repeatCount, streak: true, streakEnded: false });

    expect(service.credit({ userId: 'u1', gift: streak(1), at: 1_000 }).diamonds).toBe(10);
    expect(service.credit({ userId: 'u1', gift: streak(2), at: 1_100 }).diamonds).toBe(10);
    expect(service.credit({ userId: 'u1', gift: streak(2), at: 1_200 }).diamonds).toBe(0);
  });

  it('does not block a genuine repeat gift, since the id cannot prove re-delivery', () => {
    const service = new GiftDeduplicationService(30_000);

    // Two separate one-shot gifts with no transaction id: both must count.
    expect(service.credit({ userId: 'u1', gift: gift(), at: 1_000 }).diamonds).toBe(10);
    expect(service.credit({ userId: 'u1', gift: gift(), at: 2_000 }).diamonds).toBe(10);
  });

  it('keeps different users independent', () => {
    const service = new GiftDeduplicationService(30_000);

    expect(service.credit({ userId: 'u1', gift: gift(), at: 1_000 }).diamonds).toBe(10);
    expect(service.credit({ userId: 'u2', gift: gift(), at: 1_000 }).diamonds).toBe(10);
  });
});
