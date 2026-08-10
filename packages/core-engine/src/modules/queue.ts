/**
 * Queue priority strategies (Blueprint §19–§20).
 *
 * The comparator lives here as a named strategy instead of being scattered through the engine.
 */

import type { PriorityMode, QueueEntry, UserState } from '@dance-arena/contracts';

import type { RandomSource } from '../ports.js';

export interface PriorityContext {
  readonly users: ReadonlyMap<string, UserState>;
  readonly random: RandomSource;
}

/**
 * Score used to order the queue. Higher wins; ties fall back to `joinedAt` (FIFO) so the queue is
 * always deterministic.
 */
export function computePriorityScore(
  entry: QueueEntry,
  mode: PriorityMode,
  context: PriorityContext,
): number {
  const user = context.users.get(entry.userId);

  switch (mode) {
    case 'fifo':
      return 0;

    case 'gift-priority':
      // Blueprint §20 default: giftCount → totalDiamonds → lastGiftAt → joinedAt.
      // Packed into one score so the comparator stays a simple sort.
      return (user?.giftCount ?? 0) * 1_000_000 + (user?.totalDiamonds ?? 0);

    case 'highest-diamond':
      return user?.totalDiamonds ?? 0;

    case 'recent-supporter':
      return user?.lastGiftAt ?? 0;

    case 'random':
      return context.random.next();
  }
}

/** Sorts a queue in place: priority desc → lastGiftAt asc → joinedAt asc → id asc. */
export function sortQueue(queue: QueueEntry[]): QueueEntry[] {
  return queue.sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;

    const leftGift = left.lastGiftAt ?? Number.MAX_SAFE_INTEGER;
    const rightGift = right.lastGiftAt ?? Number.MAX_SAFE_INTEGER;
    if (leftGift !== rightGift) return leftGift - rightGift;

    if (left.joinedAt !== right.joinedAt) return left.joinedAt - right.joinedAt;

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}
