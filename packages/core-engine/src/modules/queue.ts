/**
 * Queue priority strategies (Blueprint §19–§20).
 *
 * The default `gift-priority` order is LEXICOGRAPHIC, not a packed numeric score:
 *
 *   1. giftCount        (more gifts always wins, whatever the diamond amounts are)
 *   2. totalDiamonds    (tie-break within the same gift count)
 *   3. lastGiftAt       (MORE RECENT gift wins — momentum, not seniority)
 *   4. joinedAt         (earlier GO wins)
 *   5. entry id         (stable, so equal entries never reorder between sorts)
 *
 * A packed score such as `giftCount * 1e6 + diamonds` cannot express this: a large enough diamond
 * total would overflow into the gift-count field and outrank someone who gifted more often.
 */

import type { PriorityMode, QueueEntry, UserState } from '@dance-arena/contracts';

import type { RandomSource } from '../ports.js';

export interface PriorityContext {
  readonly users: ReadonlyMap<string, UserState>;
  readonly random: RandomSource;
}

export type QueueComparator = (left: QueueEntry, right: QueueEntry) => number;

/**
 * Informational score shown in CONTROL and used as the authority ONLY for `random` mode, where a
 * stable per-entry value is what keeps the order from reshuffling on every re-sort.
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
      // Display only — the comparator below is the authority.
      return (user?.giftCount ?? 0) * 1_000_000 + (user?.totalDiamonds ?? 0);

    case 'highest-diamond':
      return user?.totalDiamonds ?? 0;

    case 'recent-supporter':
      return user?.lastGiftAt ?? 0;

    case 'random':
      return context.random.next();
  }
}

/** Ascending by join time, then by id — the stable base every mode falls back to. */
function byArrival(left: QueueEntry, right: QueueEntry): number {
  if (left.joinedAt !== right.joinedAt) return left.joinedAt - right.joinedAt;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** Descending; a user who never gifted sorts last. */
function byLastGiftDesc(left: QueueEntry, right: QueueEntry, context: PriorityContext): number {
  const leftAt = context.users.get(left.userId)?.lastGiftAt ?? left.lastGiftAt ?? 0;
  const rightAt = context.users.get(right.userId)?.lastGiftAt ?? right.lastGiftAt ?? 0;

  return rightAt - leftAt;
}

export function createQueueComparator(
  mode: PriorityMode,
  context: PriorityContext,
): QueueComparator {
  switch (mode) {
    case 'fifo':
      return byArrival;

    case 'gift-priority':
      return (left, right) => {
        const leftUser = context.users.get(left.userId);
        const rightUser = context.users.get(right.userId);

        const giftCountDelta = (rightUser?.giftCount ?? 0) - (leftUser?.giftCount ?? 0);
        if (giftCountDelta !== 0) return giftCountDelta;

        const diamondDelta = (rightUser?.totalDiamonds ?? 0) - (leftUser?.totalDiamonds ?? 0);
        if (diamondDelta !== 0) return diamondDelta;

        const recencyDelta = byLastGiftDesc(left, right, context);
        if (recencyDelta !== 0) return recencyDelta;

        return byArrival(left, right);
      };

    case 'highest-diamond':
      return (left, right) => {
        const diamondDelta =
          (context.users.get(right.userId)?.totalDiamonds ?? 0) -
          (context.users.get(left.userId)?.totalDiamonds ?? 0);
        if (diamondDelta !== 0) return diamondDelta;

        return byArrival(left, right);
      };

    case 'recent-supporter':
      return (left, right) => {
        const recencyDelta = byLastGiftDesc(left, right, context);
        if (recencyDelta !== 0) return recencyDelta;

        return byArrival(left, right);
      };

    case 'random':
      return (left, right) => {
        // `priorityScore` is assigned once per entry, so the shuffle is stable across re-sorts.
        if (right.priorityScore !== left.priorityScore) {
          return right.priorityScore - left.priorityScore;
        }

        return byArrival(left, right);
      };
  }
}

/** Sorts a queue in place using the mode's comparator. */
export function sortQueue(
  queue: QueueEntry[],
  mode: PriorityMode,
  context: PriorityContext,
): QueueEntry[] {
  return queue.sort(createQueueComparator(mode, context));
}
