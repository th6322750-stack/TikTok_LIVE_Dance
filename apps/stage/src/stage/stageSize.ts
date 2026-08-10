/**
 * STAGE design resolution.
 *
 * Blueprint §5/§22: STAGE is a 9:16 portrait surface (720×1280 / 1080×1920). Layout uses
 * normalized coordinates (0.0 → 1.0) so the same logical slots scale across resolutions —
 * pure functions here, no PixiJS, so this stays testable without WebGL.
 */

export interface StageSize {
  readonly width: number;
  readonly height: number;
}

/** Portrait 9:16, the capture format used by TikTok LIVE Studio / OBS. */
export const STAGE_ASPECT_RATIO = 9 / 16;

export const DEFAULT_STAGE_SIZE: StageSize = Object.freeze({ width: 720, height: 1280 });

/**
 * Fills in a stage size from partial input, keeping the 9:16 ratio.
 *
 * Passing only one dimension derives the other from {@link STAGE_ASPECT_RATIO}.
 */
export function resolveStageSize(size: Partial<StageSize> = {}): StageSize {
  const { width, height } = size;

  if (width !== undefined && height !== undefined) return { width, height };
  if (width !== undefined) return { width, height: Math.round(width / STAGE_ASPECT_RATIO) };
  if (height !== undefined) return { width: Math.round(height * STAGE_ASPECT_RATIO), height };

  return DEFAULT_STAGE_SIZE;
}
