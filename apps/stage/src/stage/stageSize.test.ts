import { describe, expect, it } from 'vitest';

import { computeStageFit, toPixels } from './slotLayout.js';
import {
  DEFAULT_STAGE_SIZE,
  resolveStageSize,
  STAGE_ASPECT_RATIO,
  type StageSize,
} from './stageSize.js';

const ratioOf = (size: StageSize): number => size.width / size.height;

describe('resolveStageSize', () => {
  it('defaults to the 720x1280 portrait stage', () => {
    expect(resolveStageSize()).toEqual({ width: 720, height: 1280 });
    expect(ratioOf(DEFAULT_STAGE_SIZE)).toBeCloseTo(STAGE_ASPECT_RATIO);
  });

  it('derives the missing dimension from the 9:16 ratio', () => {
    expect(resolveStageSize({ width: 1080 })).toEqual({ width: 1080, height: 1920 });
    expect(resolveStageSize({ height: 1920 })).toEqual({ width: 1080, height: 1920 });
  });

  it('keeps an explicit size untouched even when it is not 9:16', () => {
    expect(resolveStageSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });
});

describe('viewport fit (Task 06 resize requirement)', () => {
  it('scales 720x1280 content to a 1080x1920 window without distortion', () => {
    const fit = computeStageFit({ width: 1080, height: 1920 });

    expect(fit.scale).toBeCloseTo(1.5);
    expect(fit.offsetX).toBeCloseTo(0);
    expect(fit.offsetY).toBeCloseTo(0);
  });

  it('letterboxes a wider viewport instead of stretching', () => {
    const fit = computeStageFit({ width: 1920, height: 1280 });

    expect(fit.scale).toBeCloseTo(1);
    expect(fit.offsetX).toBeGreaterThan(0);
    expect(fit.offsetY).toBeCloseTo(0);
  });

  it('keeps normalized coordinates aligned across resolutions', () => {
    const center = { x: 0.5, y: 0.5 };

    const at720 = toPixels(center, { width: 720, height: 1280 });
    const at1080 = toPixels(center, { width: 1080, height: 1920 });

    expect(at720).toEqual({ x: 360, y: 640 });
    expect(at1080).toEqual({ x: 540, y: 960 });

    // Same relative placement at both resolutions.
    expect(at720.x / 720).toBeCloseTo(at1080.x / 1080);
    expect(at720.y / 1280).toBeCloseTo(at1080.y / 1920);
  });
});
