/**
 * Ports the engine depends on instead of reaching for ambient capabilities.
 *
 * The Core Engine must be deterministic and platform-neutral (Blueprint §14): no `Date.now()`,
 * no `Math.random()`, no uuid library, no timers. Everything time- or entropy-shaped is injected,
 * which is what makes every gameplay invariant testable without fake globals.
 */

/** Wall clock, injected so tests can advance time exactly. */
export interface Clock {
  now(): number;
}

/** Monotonic id source, injected so snapshots are byte-identical across runs. */
export interface IdGenerator {
  next(prefix: string): string;
}

/** Entropy source, injected so the `random` queue priority mode stays reproducible. */
export interface RandomSource {
  /** Uniform value in [0, 1). */
  next(): number;
}

export function createFixedClock(
  startAt = 0,
): Clock & { set(at: number): void; advance(byMs: number): void } {
  let current = startAt;
  return {
    now: () => current,
    set: (at: number) => {
      current = at;
    },
    advance: (byMs: number) => {
      current += byMs;
    },
  };
}

/** Deterministic `prefix-000001` style ids. */
export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();

  return {
    next(prefix: string): string {
      const nextValue = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, nextValue);
      return `${prefix}-${String(nextValue).padStart(6, '0')}`;
    },
  };
}

/**
 * Deterministic PRNG (mulberry32) — the engine never uses `Math.random()` so that a replay of the
 * same event log always produces the same canonical state.
 */
export function createSeededRandom(seed = 1): RandomSource {
  let state = seed >>> 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
