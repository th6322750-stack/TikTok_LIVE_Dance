import { describe, expect, it } from 'vitest';

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
