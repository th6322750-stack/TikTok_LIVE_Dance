/**
 * Blocker 4 regression — the default gift-priority order must be lexicographic.
 *
 *   giftCount → totalDiamonds → most recent gift → earliest GO → stable id
 */

import type { QueueEntry, UserState } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../ports.js';
import { sortQueue, type PriorityContext } from './queue.js';

function user(id: string, overrides: Partial<UserState> = {}): UserState {
  return {
    id,
    nickname: `User ${id}`,
    totalDiamonds: 0,
    giftCount: 0,
    follow: false,
    lastSeenAt: 0,
    ...overrides,
  };
}

function entry(id: string, userId: string, joinedAt: number): QueueEntry {
  return { id, userId, joinedAt, priorityScore: 0, diamondsWhileWaiting: 0 };
}

function contextOf(users: UserState[]): PriorityContext {
  return {
    users: new Map(users.map((state) => [state.id, state])),
    random: createSeededRandom(1),
  };
}

const orderOf = (queue: QueueEntry[]): string[] => queue.map((item) => item.userId);

describe('gift-priority level 1 — giftCount always wins', () => {
  it('puts more gifts first even against a vastly larger diamond total', () => {
    // The old packed score (giftCount * 1e6 + diamonds) let 5,000,000 diamonds overflow into the
    // gift-count field and beat a user with more gifts.
    const context = contextOf([
      user('many-gifts', { giftCount: 5, totalDiamonds: 50 }),
      user('one-whale-gift', { giftCount: 1, totalDiamonds: 5_000_000 }),
    ]);

    const queue = [entry('q1', 'one-whale-gift', 1_000), entry('q2', 'many-gifts', 2_000)];

    expect(orderOf(sortQueue(queue, 'gift-priority', context))).toEqual([
      'many-gifts',
      'one-whale-gift',
    ]);
  });

  it('orders three users purely by gift count', () => {
    const context = contextOf([
      user('a', { giftCount: 1, totalDiamonds: 900_000 }),
      user('b', { giftCount: 3, totalDiamonds: 30 }),
      user('c', { giftCount: 2, totalDiamonds: 60_000 }),
    ]);

    const queue = [entry('q1', 'a', 1_000), entry('q2', 'b', 1_100), entry('q3', 'c', 1_200)];

    expect(orderOf(sortQueue(queue, 'gift-priority', context))).toEqual(['b', 'c', 'a']);
  });
});

describe('gift-priority level 2 — diamonds break a giftCount tie', () => {
  it('ranks the higher diamond total first', () => {
    const context = contextOf([
      user('rich', { giftCount: 2, totalDiamonds: 900 }),
      user('poor', { giftCount: 2, totalDiamonds: 100 }),
    ]);

    const queue = [entry('q1', 'poor', 1_000), entry('q2', 'rich', 2_000)];

    expect(orderOf(sortQueue(queue, 'gift-priority', context))).toEqual(['rich', 'poor']);
  });
});

describe('gift-priority level 3 — the MORE RECENT gift wins', () => {
  it('prefers the newer supporter when gifts and diamonds tie', () => {
    // Previously lastGiftAt sorted ascending, so the older gift won.
    const context = contextOf([
      user('recent', { giftCount: 2, totalDiamonds: 500, lastGiftAt: 9_000 }),
      user('stale', { giftCount: 2, totalDiamonds: 500, lastGiftAt: 2_000 }),
    ]);

    const queue = [entry('q1', 'stale', 1_000), entry('q2', 'recent', 1_500)];

    expect(orderOf(sortQueue(queue, 'gift-priority', context))).toEqual(['recent', 'stale']);
  });

  it('sorts a user who never gifted last', () => {
    const context = contextOf([
      user('gifted', { giftCount: 0, totalDiamonds: 0, lastGiftAt: 5_000 }),
      user('never', { giftCount: 0, totalDiamonds: 0 }),
    ]);

    const queue = [entry('q1', 'never', 1_000), entry('q2', 'gifted', 2_000)];

    expect(orderOf(sortQueue(queue, 'gift-priority', context))).toEqual(['gifted', 'never']);
  });
});

describe('gift-priority level 4/5 — arrival then stable id', () => {
  it('prefers the earlier GO when everything else ties', () => {
    const context = contextOf([
      user('early', { giftCount: 1, totalDiamonds: 100, lastGiftAt: 5_000 }),
      user('late', { giftCount: 1, totalDiamonds: 100, lastGiftAt: 5_000 }),
    ]);

    const queue = [entry('q2', 'late', 4_000), entry('q1', 'early', 1_000)];

    expect(orderOf(sortQueue(queue, 'gift-priority', context))).toEqual(['early', 'late']);
  });

  it('falls back to the entry id so equal entries never reorder', () => {
    const context = contextOf([user('a'), user('b')]);

    const first = sortQueue(
      [entry('q2', 'b', 1_000), entry('q1', 'a', 1_000)],
      'gift-priority',
      context,
    );
    const second = sortQueue(
      [entry('q1', 'a', 1_000), entry('q2', 'b', 1_000)],
      'gift-priority',
      context,
    );

    expect(orderOf(first)).toEqual(['a', 'b']);
    expect(orderOf(second)).toEqual(['a', 'b']);
  });

  it('is idempotent when applied twice', () => {
    const context = contextOf([
      user('a', { giftCount: 2, totalDiamonds: 10, lastGiftAt: 3_000 }),
      user('b', { giftCount: 2, totalDiamonds: 10, lastGiftAt: 3_000 }),
      user('c', { giftCount: 1, totalDiamonds: 999 }),
    ]);

    const queue = [entry('q1', 'a', 1_000), entry('q2', 'b', 1_000), entry('q3', 'c', 900)];
    const once = orderOf(sortQueue([...queue], 'gift-priority', context));
    const twice = orderOf(
      sortQueue(sortQueue([...queue], 'gift-priority', context), 'gift-priority', context),
    );

    expect(twice).toEqual(once);
  });
});

describe('other priority modes', () => {
  it('fifo ignores gifts entirely', () => {
    const context = contextOf([
      user('whale', { giftCount: 9, totalDiamonds: 90_000 }),
      user('first', {}),
    ]);

    const queue = [entry('q2', 'whale', 5_000), entry('q1', 'first', 1_000)];

    expect(orderOf(sortQueue(queue, 'fifo', context))).toEqual(['first', 'whale']);
  });

  it('highest-diamond ignores gift count', () => {
    const context = contextOf([
      user('many', { giftCount: 9, totalDiamonds: 100 }),
      user('big', { giftCount: 1, totalDiamonds: 5_000 }),
    ]);

    const queue = [entry('q1', 'many', 1_000), entry('q2', 'big', 2_000)];

    expect(orderOf(sortQueue(queue, 'highest-diamond', context))).toEqual(['big', 'many']);
  });

  it('recent-supporter ranks the newest gift first', () => {
    const context = contextOf([
      user('old', { lastGiftAt: 1_000 }),
      user('new', { lastGiftAt: 8_000 }),
    ]);

    const queue = [entry('q1', 'old', 1_000), entry('q2', 'new', 2_000)];

    expect(orderOf(sortQueue(queue, 'recent-supporter', context))).toEqual(['new', 'old']);
  });

  it('random keeps a stable order across repeated sorts', () => {
    const context = contextOf([user('a'), user('b'), user('c')]);
    const queue = [
      { ...entry('q1', 'a', 1_000), priorityScore: 0.2 },
      { ...entry('q2', 'b', 1_000), priorityScore: 0.9 },
      { ...entry('q3', 'c', 1_000), priorityScore: 0.5 },
    ];

    const once = orderOf(sortQueue([...queue], 'random', context));
    const twice = orderOf(sortQueue([...queue], 'random', context));

    expect(once).toEqual(['b', 'c', 'a']);
    expect(twice).toEqual(once);
  });
});
