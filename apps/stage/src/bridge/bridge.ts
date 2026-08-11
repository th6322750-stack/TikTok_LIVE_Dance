/**
 * Access to the STAGE preload whitelist.
 *
 * STAGE has no command channel at all — it can request a snapshot and subscribe to render events,
 * nothing else (Blueprint §42).
 */

import type { DanceArenaStageBridge } from '@dance-arena/contracts';

declare global {
  interface Window {
    readonly danceArenaStage?: DanceArenaStageBridge;
  }
}

export function getStageBridge(): DanceArenaStageBridge | undefined {
  if (typeof window === 'undefined') return undefined;

  return window.danceArenaStage;
}
