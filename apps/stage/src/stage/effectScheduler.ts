/**
 * Gift effect scheduler (Task 09: "effect scheduler tránh quá tải khi gift spam").
 *
 * A 1000💎 gift storm can emit dozens of effects per second. Playing all of them would tank the
 * frame rate and, worse, hide the big ones behind a wall of small ones. This scheduler enforces the
 * performance profile's concurrency budget and resolves contention by VISUAL WEIGHT, which the
 * engine already assigned via the gift tier — it never re-derives a tier from a diamond amount.
 *
 * Policy:
 *  - below the cap → play immediately;
 *  - at the cap → queue, bounded, highest weight first;
 *  - a heavier effect may PREEMPT the weakest playing one, so a tier-5 takeover is never starved;
 *  - a lighter effect that cannot fit is dropped and counted (never silently forgotten).
 *
 * Time is injected, so behaviour is verifiable without a renderer or real timers.
 */

export interface ScheduledEffect {
  readonly id: string;
  /** Higher wins contention; comes from the theme's gift tier `visualWeight`. */
  readonly weight: number;
  readonly durationMs: number;
}

export interface EffectSchedulerOptions {
  readonly now: () => number;
  readonly maxConcurrent: number;
  /** Pending effects kept while at capacity. */
  readonly queueCapacity?: number;
  readonly play: (effect: ScheduledEffect) => void;
  readonly stop: (effect: ScheduledEffect) => void;
}

export interface EffectSchedulerStats {
  readonly played: number;
  readonly queued: number;
  readonly dropped: number;
  readonly preempted: number;
  readonly active: number;
  readonly pending: number;
}

export interface EffectScheduler {
  /** Returns true when the effect started playing, false when queued or dropped. */
  submit(effect: ScheduledEffect): boolean;
  /** Expires finished effects and promotes queued ones. Call once per frame. */
  update(): void;
  setMaxConcurrent(max: number): void;
  clear(): void;
  activeIds(): string[];
  readonly stats: EffectSchedulerStats;
}

interface ActiveEffect {
  readonly effect: ScheduledEffect;
  readonly endsAt: number;
}

const DEFAULT_QUEUE_CAPACITY = 24;

export function createEffectScheduler(options: EffectSchedulerOptions): EffectScheduler {
  const queueCapacity = options.queueCapacity ?? DEFAULT_QUEUE_CAPACITY;

  let maxConcurrent = Math.max(1, options.maxConcurrent);
  let active: ActiveEffect[] = [];
  let pending: ScheduledEffect[] = [];

  let played = 0;
  let queued = 0;
  let dropped = 0;
  let preempted = 0;

  function start(effect: ScheduledEffect): void {
    active.push({ effect, endsAt: options.now() + Math.max(0, effect.durationMs) });
    played += 1;
    options.play(effect);
  }

  /** Weakest currently playing effect, used as the preemption candidate. */
  function weakestActive(): ActiveEffect | undefined {
    return active.reduce<ActiveEffect | undefined>((weakest, candidate) => {
      if (weakest === undefined) return candidate;
      return candidate.effect.weight < weakest.effect.weight ? candidate : weakest;
    }, undefined);
  }

  function enqueue(effect: ScheduledEffect): void {
    if (pending.length >= queueCapacity) {
      // Drop the weakest pending effect rather than the newest arrival, unless it IS the weakest.
      const weakestIndex = pending.reduce(
        (weakest, candidate, index) =>
          candidate.weight < (pending[weakest]?.weight ?? Number.POSITIVE_INFINITY)
            ? index
            : weakest,
        0,
      );
      const weakestPending = pending[weakestIndex];

      if (weakestPending !== undefined && weakestPending.weight >= effect.weight) {
        dropped += 1;
        return;
      }

      pending.splice(weakestIndex, 1);
      dropped += 1;
    }

    pending.push(effect);
    queued += 1;
  }

  function promote(): void {
    if (pending.length === 0 || active.length >= maxConcurrent) return;

    // Highest weight first; equal weights keep arrival order.
    pending.sort((left, right) => right.weight - left.weight);

    while (active.length < maxConcurrent) {
      const next = pending.shift();
      if (next === undefined) break;
      start(next);
    }
  }

  return {
    submit(effect: ScheduledEffect): boolean {
      if (active.length < maxConcurrent) {
        start(effect);
        return true;
      }

      const weakest = weakestActive();
      if (weakest !== undefined && effect.weight > weakest.effect.weight) {
        active = active.filter((candidate) => candidate !== weakest);
        preempted += 1;
        options.stop(weakest.effect);
        start(effect);
        return true;
      }

      enqueue(effect);
      return false;
    },

    update(): void {
      const now = options.now();
      const finished = active.filter((candidate) => candidate.endsAt <= now);

      if (finished.length > 0) {
        active = active.filter((candidate) => candidate.endsAt > now);
        for (const candidate of finished) options.stop(candidate.effect);
      }

      promote();
    },

    setMaxConcurrent(max: number): void {
      maxConcurrent = Math.max(1, max);

      // Tightening the budget stops the weakest effects immediately.
      while (active.length > maxConcurrent) {
        const weakest = weakestActive();
        if (weakest === undefined) break;

        active = active.filter((candidate) => candidate !== weakest);
        preempted += 1;
        options.stop(weakest.effect);
      }
    },

    clear(): void {
      for (const candidate of active) options.stop(candidate.effect);
      active = [];
      pending = [];
    },

    activeIds: () => active.map((candidate) => candidate.effect.id),

    get stats(): EffectSchedulerStats {
      return { played, queued, dropped, preempted, active: active.length, pending: pending.length };
    },
  };
}
