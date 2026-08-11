/**
 * Reconnect backoff (Blueprint §8).
 *
 * 1s → 2s → 4s → 8s → 15s → 30s, then held at 30s, with ±20% jitter so a provider outage does not
 * produce a synchronized reconnect stampede from every running client.
 */

import { RECONNECT_BACKOFF_MS, RECONNECT_JITTER_RATIO } from '@dance-arena/contracts';

export interface BackoffOptions {
  /** 0-based attempt index. */
  readonly attempt: number;
  /** Uniform value in [0, 1); injected so the schedule is reproducible in tests. */
  readonly random: number;
  readonly jitterRatio?: number;
}

export function baseBackoffDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), RECONNECT_BACKOFF_MS.length - 1);
  return (
    RECONNECT_BACKOFF_MS[index] ?? RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1] ?? 30_000
  );
}

export function computeBackoffDelay({ attempt, random, jitterRatio }: BackoffOptions): number {
  const base = baseBackoffDelay(attempt);
  const ratio = jitterRatio ?? RECONNECT_JITTER_RATIO;

  // random ∈ [0,1) → factor ∈ [1-ratio, 1+ratio)
  const factor = 1 + (random * 2 - 1) * ratio;

  return Math.max(0, Math.round(base * factor));
}
