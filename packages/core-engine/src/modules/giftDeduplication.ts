/**
 * Gift deduplication (Blueprint §13) — the single most error-prone rule in the product.
 *
 * A TikTok combo does NOT deliver increments. The provider re-sends the same gift with a growing
 * `repeatCount`: x1, x2, x3, x4. Summing the events would credit 1+2+3+4 = 10 diamonds' worth of
 * repeats for a combo that is actually 4. This service converts the cumulative stream into deltas.
 *
 * Two records are kept, deliberately separate:
 *
 *  1. OPEN STREAKS — a combo still in progress, keyed by transaction id when available.
 *  2. FINALIZED LEDGER — transaction ids already closed. A provider can re-deliver the final frame
 *     of a combo (or a one-shot gift) after a reconnect; without this ledger those diamonds would
 *     be credited a second time. Bounded by TTL and by entry count so it cannot grow without end.
 *
 * The ledger only tracks TRANSACTION-ID keys, because only those identify one specific transaction.
 * A fallback key (`userId + giftId`) cannot distinguish "the same gift re-delivered" from "the same
 * gift genuinely sent again", so blocking it would drop real diamonds.
 */

import type { GiftPayload } from '@dance-arena/contracts';

/** Upper bound on remembered transactions; oldest entries are evicted first (LRU by insertion). */
const DEFAULT_FINALIZED_CAPACITY = 5_000;

/** How long a finalized transaction stays remembered. Covers a reconnect-and-replay window. */
const DEFAULT_FINALIZED_TTL_MS = 10 * 60_000;

export interface GiftCreditInput {
  readonly userId: string;
  readonly gift: GiftPayload;
  readonly at: number;
}

export interface GiftCredit {
  /** Diamonds to credit for THIS event. 0 for a duplicate or out-of-order re-delivery. */
  readonly diamonds: number;
  /** Repeats credited by this event. */
  readonly repeats: number;
  /** Deduplication key that was used — exposed for diagnostics/tests. */
  readonly key: string;
  /** True when this event closed the combo. */
  readonly finalized: boolean;
  /** Why nothing was credited, when that is the case. */
  readonly duplicateOf?: 'open-streak' | 'finalized-transaction';
}

export interface GiftDeduplicationOptions {
  readonly finalizedTtlMs?: number;
  readonly finalizedCapacity?: number;
}

interface StreakRecord {
  countedRepeat: number;
  lastSeenAt: number;
}

interface FinalizedRecord {
  creditedRepeat: number;
  finalizedAt: number;
}

export class GiftDeduplicationService {
  private readonly streaks = new Map<string, StreakRecord>();
  /** Insertion-ordered: the first key is the oldest, which is what LRU eviction removes. */
  private readonly finalized = new Map<string, FinalizedRecord>();

  private readonly finalizedTtlMs: number;
  private readonly finalizedCapacity: number;

  constructor(
    private windowMs: number,
    options: GiftDeduplicationOptions = {},
  ) {
    this.finalizedTtlMs = options.finalizedTtlMs ?? DEFAULT_FINALIZED_TTL_MS;
    this.finalizedCapacity = options.finalizedCapacity ?? DEFAULT_FINALIZED_CAPACITY;
  }

  setWindowMs(windowMs: number): void {
    this.windowMs = windowMs;
  }

  /**
   * Returns the diamonds that this event adds on top of everything already credited for the
   * same combo.
   */
  credit({ userId, gift, at }: GiftCreditInput): GiftCredit {
    const key = this.keyFor(userId, gift);
    const isTransactionKey = key.startsWith('tx:');
    const unitValue = resolveUnitValue(gift);
    const repeatCount = Math.max(gift.repeatCount, 1);

    // 1. Already-closed transaction re-delivered (typically after a reconnect).
    const closed = this.finalized.get(key);
    if (closed !== undefined) {
      if (at - closed.finalizedAt > this.finalizedTtlMs) {
        this.finalized.delete(key);
      } else if (repeatCount <= closed.creditedRepeat) {
        // Refresh recency so a repeatedly replayed frame stays remembered.
        this.touchFinalized(key, closed, at);
        return {
          diamonds: 0,
          repeats: 0,
          key,
          finalized: true,
          duplicateOf: 'finalized-transaction',
        };
      } else {
        // A closed combo that somehow grew: credit only the genuinely new repeats.
        const repeats = repeatCount - closed.creditedRepeat;
        this.touchFinalized(key, { creditedRepeat: repeatCount, finalizedAt: at }, at);
        return { diamonds: repeats * unitValue, repeats, key, finalized: true };
      }
    }

    // 2. Open streak accounting.
    const existing = this.streaks.get(key);
    const isStale = existing !== undefined && at - existing.lastSeenAt > this.windowMs;
    const countedRepeat = existing === undefined || isStale ? 0 : existing.countedRepeat;

    if (repeatCount <= countedRepeat) {
      this.streaks.set(key, { countedRepeat, lastSeenAt: at });
      if (gift.streakEnded) this.finalize(key, countedRepeat, at, isTransactionKey);

      return {
        diamonds: 0,
        repeats: 0,
        key,
        finalized: gift.streakEnded,
        duplicateOf: 'open-streak',
      };
    }

    const repeats = repeatCount - countedRepeat;

    if (gift.streakEnded) {
      this.finalize(key, repeatCount, at, isTransactionKey);
    } else {
      this.streaks.set(key, { countedRepeat: repeatCount, lastSeenAt: at });
    }

    return { diamonds: repeats * unitValue, repeats, key, finalized: gift.streakEnded };
  }

  /** Drops records that can no longer receive an update, so neither map grows unbounded. */
  prune(now: number): void {
    for (const [key, record] of this.streaks) {
      if (now - record.lastSeenAt > this.windowMs) this.streaks.delete(key);
    }

    for (const [key, record] of this.finalized) {
      if (now - record.finalizedAt > this.finalizedTtlMs) this.finalized.delete(key);
    }
  }

  reset(): void {
    this.streaks.clear();
    this.finalized.clear();
  }

  get openStreakCount(): number {
    return this.streaks.size;
  }

  get finalizedCount(): number {
    return this.finalized.size;
  }

  private finalize(
    key: string,
    creditedRepeat: number,
    at: number,
    isTransactionKey: boolean,
  ): void {
    this.streaks.delete(key);

    // Only transaction ids identify one specific transaction; see the file header.
    if (!isTransactionKey) return;

    this.touchFinalized(key, { creditedRepeat, finalizedAt: at }, at);
  }

  /** Re-inserts the key so Map iteration order stays "oldest first", then enforces the bounds. */
  private touchFinalized(key: string, record: FinalizedRecord, now: number): void {
    this.finalized.delete(key);
    this.finalized.set(key, { ...record, finalizedAt: now });

    for (const [candidate, entry] of this.finalized) {
      if (now - entry.finalizedAt <= this.finalizedTtlMs) break;
      this.finalized.delete(candidate);
    }

    while (this.finalized.size > this.finalizedCapacity) {
      const oldest = this.finalized.keys().next();
      if (oldest.done === true) break;
      this.finalized.delete(oldest.value);
    }
  }

  private keyFor(userId: string, gift: GiftPayload): string {
    if (gift.transactionId !== undefined && gift.transactionId.length > 0) {
      return `tx:${gift.transactionId}`;
    }

    const giftKey = gift.id !== undefined && gift.id.length > 0 ? gift.id : gift.name;
    return `user:${userId}|gift:${giftKey}`;
  }
}

/**
 * Diamonds per single repeat.
 *
 * Providers are inconsistent: some send `diamondValue` per unit, some only a cumulative
 * `totalDiamonds`. Derive the unit value defensively rather than trusting one field.
 */
function resolveUnitValue(gift: GiftPayload): number {
  if (gift.diamondValue > 0) return gift.diamondValue;

  const repeatCount = Math.max(gift.repeatCount, 1);
  if (gift.totalDiamonds > 0) return Math.floor(gift.totalDiamonds / repeatCount);

  return 0;
}
