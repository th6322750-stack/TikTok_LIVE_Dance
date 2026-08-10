/**
 * Access to the preload whitelist.
 *
 * CONTROL talks to Main ONLY through this object. There is no fallback that touches Node, and no
 * path that mutates game state locally — when the bridge is missing (plain browser dev server),
 * the UI degrades to read-only instead of inventing state (Blueprint §42, Task 05 state rule).
 */

import type { DanceArenaControlBridge } from '@dance-arena/contracts';

declare global {
  interface Window {
    readonly danceArena?: DanceArenaControlBridge;
  }
}

export function getControlBridge(): DanceArenaControlBridge | undefined {
  if (typeof window === 'undefined') return undefined;

  return window.danceArena;
}

export function isBridgeAvailable(): boolean {
  return getControlBridge() !== undefined;
}
