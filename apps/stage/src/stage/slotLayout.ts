/**
 * STAGE slot layout (Blueprint §22).
 *
 * The engine assigns LOGICAL slots (`normal-01`, `vip-03`); STAGE decides where those slots sit
 * on screen. Coordinates stay normalized (0..1) so the same layout scales across 720p/1080p/1440p
 * without any pixel maths leaking into gameplay.
 *
 * If STAGE does not know a slot id, it falls back to the normalized position the engine supplied,
 * so an engine-side layout change can never leave a dancer unplaceable.
 */

import type { NormalizedPosition } from '@dance-arena/contracts';

import { DEFAULT_STAGE_SIZE, type StageSize } from './stageSize.js';

export interface SlotLayout {
  positionOf(slotId: string, fallback: NormalizedPosition): NormalizedPosition;
  has(slotId: string): boolean;
}

const NORMAL_COLUMNS = 6;
const VIP_COLUMNS = 5;

/** Parses `normal-07` → `{ zone: 'normal', index: 7 }`. */
function parseSlotId(slotId: string): { zone: string; index: number } | undefined {
  const match = /^([a-z]+)-(\d+)$/.exec(slotId);
  if (match === null) return undefined;

  const zone = match[1];
  const index = Number(match[2]);
  if (zone === undefined || !Number.isFinite(index) || index < 1) return undefined;

  return { zone, index };
}

/**
 * Default STAGE layout: VIP podium in the upper third, normal dancers gridded across the lower
 * half of the portrait canvas.
 */
export function createDefaultSlotLayout(): SlotLayout {
  const cache = new Map<string, NormalizedPosition>();

  const compute = (slotId: string): NormalizedPosition | undefined => {
    const parsed = parseSlotId(slotId);
    if (parsed === undefined) return undefined;

    const zeroBased = parsed.index - 1;

    if (parsed.zone === 'vip') {
      const column = zeroBased % VIP_COLUMNS;
      const row = Math.floor(zeroBased / VIP_COLUMNS);
      return {
        x: round((column + 0.5) / VIP_COLUMNS),
        y: round(0.3 + row * 0.1),
      };
    }

    if (parsed.zone === 'normal') {
      const column = zeroBased % NORMAL_COLUMNS;
      const row = Math.floor(zeroBased / NORMAL_COLUMNS);
      return {
        x: round((column + 0.5) / NORMAL_COLUMNS),
        y: round(0.56 + row * 0.09),
      };
    }

    return undefined;
  };

  return {
    has: (slotId) => compute(slotId) !== undefined,
    positionOf(slotId, fallback) {
      const cached = cache.get(slotId);
      if (cached !== undefined) return cached;

      const computed = compute(slotId);
      if (computed === undefined) return clampPosition(fallback);

      cache.set(slotId, computed);
      return computed;
    },
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampPosition(position: NormalizedPosition): NormalizedPosition {
  return {
    x: Math.min(1, Math.max(0, position.x)),
    y: Math.min(1, Math.max(0, position.y)),
  };
}

/** Converts a normalized position to pixels for a given design size. */
export function toPixels(
  position: NormalizedPosition,
  size: StageSize = DEFAULT_STAGE_SIZE,
): { x: number; y: number } {
  return { x: position.x * size.width, y: position.y * size.height };
}

export interface StageFit {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Letterbox fit that preserves the 9:16 design aspect inside any viewport, so resizing the STAGE
 * window never distorts the layout (Task 06 resize requirement).
 */
export function computeStageFit(
  viewport: StageSize,
  design: StageSize = DEFAULT_STAGE_SIZE,
): StageFit {
  const scale = Math.min(viewport.width / design.width, viewport.height / design.height);

  return {
    scale,
    offsetX: (viewport.width - design.width * scale) / 2,
    offsetY: (viewport.height - design.height * scale) / 2,
  };
}
