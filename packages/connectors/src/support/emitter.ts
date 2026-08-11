/**
 * Minimal subscription helper shared by every connector.
 *
 * Deliberately tiny and dependency-free: connectors run in Main, and an event-emitter library
 * would drag Node built-ins into a package that must stay platform-neutral.
 */

import type { Unsubscribe } from '@dance-arena/contracts';

export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  on(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    // Copy first: a listener may unsubscribe while we iterate.
    for (const listener of [...this.listeners]) listener(value);
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
