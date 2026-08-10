/**
 * Ranking + VIP + gift tiers (Blueprint §23, §24, §26).
 *
 * Ranking is recomputed when a score changes — never per frame (Blueprint §23).
 */

import type { GiftTier, RankingEntry, UserState } from '@dance-arena/contracts';

export interface RankingComputation {
  readonly entries: RankingEntry[];
  /** Users that entered the VIP window with this computation. */
  readonly promoted: string[];
  /** Users that dropped out of the VIP window. */
  readonly demoted: string[];
  readonly vipUserIds: string[];
  readonly changed: boolean;
}

/**
 * Deterministic ranking.
 *
 * Ordering: diamonds desc → whoever reached the total first (lastGiftAt asc) → userId asc.
 * The final tie-break on id guarantees a stable, reproducible order for identical scores, which
 * is what makes snapshot equality testable.
 */
export function computeRanking(
  users: Iterable<UserState>,
  options: { size: number; vipCapacity: number; previous: RankingEntry[]; previousVip: string[] },
): RankingComputation {
  const scored = [...users].filter((user) => user.totalDiamonds > 0);

  scored.sort((left, right) => {
    if (right.totalDiamonds !== left.totalDiamonds) return right.totalDiamonds - left.totalDiamonds;

    const leftAt = left.lastGiftAt ?? Number.MAX_SAFE_INTEGER;
    const rightAt = right.lastGiftAt ?? Number.MAX_SAFE_INTEGER;
    if (leftAt !== rightAt) return leftAt - rightAt;

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  const previousRankById = new Map(options.previous.map((entry) => [entry.userId, entry.rank]));

  const fullRanking: RankingEntry[] = scored.map((user, index) => {
    const previousRank = previousRankById.get(user.id);
    return {
      rank: index + 1,
      userId: user.id,
      totalDiamonds: user.totalDiamonds,
      ...(previousRank === undefined ? {} : { previousRank }),
    };
  });

  const entries = fullRanking.slice(0, options.size);
  const vipUserIds = fullRanking.slice(0, options.vipCapacity).map((entry) => entry.userId);

  const previousVipSet = new Set(options.previousVip);
  const vipSet = new Set(vipUserIds);

  const promoted = vipUserIds.filter((userId) => !previousVipSet.has(userId));
  const demoted = options.previousVip.filter((userId) => !vipSet.has(userId));

  return {
    entries,
    promoted,
    demoted,
    vipUserIds,
    changed: !sameRanking(options.previous, entries),
  };
}

function sameRanking(left: RankingEntry[], right: RankingEntry[]): boolean {
  if (left.length !== right.length) return false;

  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      other.userId === entry.userId &&
      other.rank === entry.rank &&
      other.totalDiamonds === entry.totalDiamonds
    );
  });
}

/**
 * Resolves the effect tier for a gift amount (Blueprint §26).
 *
 * Tier thresholds are configuration; no renderer and no engine module may hard-code
 * `if (diamonds > 1000)`.
 */
export function resolveGiftTier(
  diamonds: number,
  tiers: readonly GiftTier[],
): GiftTier | undefined {
  let match: GiftTier | undefined;

  for (const tier of tiers) {
    const withinMin = diamonds >= tier.minDiamonds;
    const withinMax = tier.maxDiamonds === undefined || diamonds <= tier.maxDiamonds;

    if (withinMin && withinMax) {
      if (match === undefined || tier.priority > match.priority) match = tier;
    }
  }

  return match;
}
