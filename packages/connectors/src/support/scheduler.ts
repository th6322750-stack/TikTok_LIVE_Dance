/// <reference types="node" />

/**
 * Scheduler port.
 *
 * Reconnect backoff (Blueprint §8) and replay playback (§54) both need delayed work. Injecting a
 * scheduler keeps those behaviours testable with virtual time instead of real waiting.
 *
 * The triple-slash reference above is deliberate: workspace packages are consumed from source, so
 * this file must carry the ambient types it needs instead of relying on every consumer to enable
 * `types: ["node"]`.
 */

export type CancelScheduled = () => void;

export interface Scheduler {
  now(): number;
  schedule(afterMs: number, callback: () => void): CancelScheduled;
}

/** Scheduler backed by the host timers. Used in production wiring. */
export function createRealScheduler(): Scheduler {
  return {
    now: () => Date.now(),
    schedule(afterMs, callback) {
      const handle = setTimeout(callback, afterMs);
      return () => {
        clearTimeout(handle);
      };
    },
  };
}

interface ScheduledTask {
  readonly id: number;
  readonly dueAt: number;
  readonly callback: () => void;
}

/**
 * Virtual-time scheduler for tests: nothing runs until `advance()` is called, and callbacks fire
 * in due-time order so a replay or a backoff sequence is fully deterministic.
 */
export class ManualScheduler implements Scheduler {
  private current: number;
  private nextId = 1;
  private tasks: ScheduledTask[] = [];

  constructor(startAt = 0) {
    this.current = startAt;
  }

  now(): number {
    return this.current;
  }

  schedule(afterMs: number, callback: () => void): CancelScheduled {
    const task: ScheduledTask = {
      id: this.nextId++,
      dueAt: this.current + Math.max(0, afterMs),
      callback,
    };
    this.tasks.push(task);

    return () => {
      this.tasks = this.tasks.filter((pending) => pending.id !== task.id);
    };
  }

  /** Advances virtual time, running everything that becomes due — including tasks scheduled by
   * the callbacks themselves (that is how backoff chains and replay steps unfold). */
  advance(byMs: number): void {
    const target = this.current + byMs;

    for (;;) {
      const due = this.tasks
        .filter((task) => task.dueAt <= target)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id);

      const next = due[0];
      if (next === undefined) break;

      this.tasks = this.tasks.filter((task) => task.id !== next.id);
      this.current = Math.max(this.current, next.dueAt);
      next.callback();
    }

    this.current = target;
  }

  get pendingCount(): number {
    return this.tasks.length;
  }
}
