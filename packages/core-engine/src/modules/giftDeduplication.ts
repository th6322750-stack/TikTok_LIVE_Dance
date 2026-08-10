/**
 * Gift deduplication (Blueprint §13) — the single most error-prone rule in the product.
 *
 * A TikTok combo does NOT deliver increments. The provider re-sends the same gift with a growing
 * `repeatCount`: x1, x2, x3, x4. Summing the events would credit 1+2+3+4 = 10 diamonds' worth of
 * repeats for a combo that is actually 4. This service converts the cumulative stream into deltas.
 *
 * Key priority (Blueprint §13):
 *   1. `transactionId` — authoritative when the provider supplies it.
 *   2. `userId + giftId + time window` — fallback when it does not.
 */

import type { GiftPayload } from '@dance-arena/contracts';

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
}

interface StreakRecord {
  countedRepeat: number;
  lastSeenAt: number;
}

export class GiftDeduplicationService {
  private readonly streaks = new Map<string, StreakRecord>();

  constructor(private windowMs: number) {}

  setWindowMs(windowMs: number): void {
    this.windowMs = windowMs;
  }

  /**
   * Returns the diamonds that this event adds on top of everything already credited for the
   * same combo.
   */
  credit({ userId, gift, at }: GiftCreditInput): GiftCredit {
    const key = this.keyFor(userId, gift);
    const unitValue = resolveUnitValue(gift);
    const repeatCount = Math.max(gift.repeatCount, 1);

    const existing = this.streaks.get(key);
    const isStale = existing !== undefined && at - existing.lastSeenAt > this.windowMs;
    const countedRepeat = existing === undefined || isStale ? 0 : existing.countedRepeat;

    // Late or duplicate delivery of an already-credited repeat: credit nothing.
    if (repeatCount <= countedRepeat) {
      this.streaks.set(key, { countedRepeat, lastSeenAt: at });
      if (gift.streakEnded) this.streaks.delete(key);
      return { diamonds: 0, repeats: 0, key, finalized: gift.streakEnded };
    }

    const repeats = repeatCount - countedRepeat;

    if (gift.streakEnded) {
      // The combo is closed; forget it so an identical gift later starts a fresh streak.
      this.streaks.delete(key);
    } else {
      this.streaks.set(key, { countedRepeat: repeatCount, lastSeenAt: at });
    }

    return { diamonds: repeats * unitValue, repeats, key, finalized: gift.streakEnded };
  }

  /** Drops streaks that can no longer receive an update, so the map cannot grow unbounded. */
  prune(now: number): void {
    for (const [key, record] of this.streaks) {
      if (now - record.lastSeenAt > this.windowMs) this.streaks.delete(key);
    }
  }

  reset(): void {
    this.streaks.clear();
  }

  get openStreakCount(): number {
    return this.streaks.size;
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
