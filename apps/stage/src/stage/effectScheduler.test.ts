import { describe, expect, it } from 'vitest';

import { createEffectScheduler, type ScheduledEffect } from './effectScheduler.js';

function setup(maxConcurrent: number, queueCapacity?: number) {
  let now = 0;
  const playing: string[] = [];
  const stopped: string[] = [];

  const scheduler = createEffectScheduler({
    now: () => now,
    maxConcurrent,
    ...(queueCapacity === undefined ? {} : { queueCapacity }),
    play: (effect) => playing.push(effect.id),
    stop: (effect) => stopped.push(effect.id),
  });

  return {
    scheduler,
    playing,
    stopped,
    advance(ms: number): void {
      now += ms;
      scheduler.update();
    },
  };
}

const effect = (id: string, weight: number, durationMs = 1_000): ScheduledEffect => ({
  id,
  weight,
  durationMs,
});

describe('capacity', () => {
  it('plays effects immediately while below the cap', () => {
    const { scheduler, playing } = setup(3);

    expect(scheduler.submit(effect('a', 1))).toBe(true);
    expect(scheduler.submit(effect('b', 1))).toBe(true);
    expect(scheduler.submit(effect('c', 1))).toBe(true);

    expect(playing).toEqual(['a', 'b', 'c']);
    expect(scheduler.stats.active).toBe(3);
  });

  it('queues an equal-weight effect once at capacity', () => {
    const { scheduler, playing } = setup(1);

    scheduler.submit(effect('a', 2));
    expect(scheduler.submit(effect('b', 2))).toBe(false);

    expect(playing).toEqual(['a']);
    expect(scheduler.stats.pending).toBe(1);
  });

  it('promotes the heaviest queued effect when capacity frees up', () => {
    const { scheduler, playing, advance } = setup(1);

    // A heavy effect holds the only slot, so neither arrival can preempt it and both queue.
    scheduler.submit(effect('whale', 5, 1_000));
    expect(scheduler.submit(effect('light', 1))).toBe(false);
    expect(scheduler.submit(effect('medium', 3))).toBe(false);
    expect(scheduler.stats.pending).toBe(2);

    advance(1_100);

    // `medium` outranks `light`, so it goes first despite arriving later.
    expect(playing).toEqual(['whale', 'medium']);
    expect(scheduler.stats.pending).toBe(1);
  });

  it('preempts rather than queues when the arrival outranks what is playing', () => {
    const { scheduler, playing, stopped } = setup(1);

    scheduler.submit(effect('small', 1));
    scheduler.submit(effect('medium', 2));
    scheduler.submit(effect('large', 3));

    expect(playing).toEqual(['small', 'medium', 'large']);
    expect(stopped).toEqual(['small', 'medium']);
    expect(scheduler.activeIds()).toEqual(['large']);
    expect(scheduler.stats.pending).toBe(0);
  });

  it('expires effects after their duration', () => {
    const { scheduler, stopped, advance } = setup(2);

    scheduler.submit(effect('a', 1, 500));
    scheduler.submit(effect('b', 1, 2_000));

    advance(600);

    expect(stopped).toEqual(['a']);
    expect(scheduler.activeIds()).toEqual(['b']);
  });
});

describe('preemption by visual weight', () => {
  it('lets a heavier effect replace the weakest playing one', () => {
    const { scheduler, playing, stopped } = setup(2);

    scheduler.submit(effect('weak', 1));
    scheduler.submit(effect('mid', 3));

    expect(scheduler.submit(effect('whale', 5))).toBe(true);

    expect(stopped).toEqual(['weak']);
    expect(playing).toEqual(['weak', 'mid', 'whale']);
    expect(scheduler.stats.preempted).toBe(1);
    expect(scheduler.activeIds().sort()).toEqual(['mid', 'whale']);
  });

  it('does not preempt for an equal or lighter effect', () => {
    const { scheduler, stopped } = setup(1);

    scheduler.submit(effect('mid', 3));
    scheduler.submit(effect('same', 3));
    scheduler.submit(effect('light', 1));

    expect(stopped).toEqual([]);
    expect(scheduler.stats.preempted).toBe(0);
  });
});

describe('gift spam protection', () => {
  it('never exceeds the cap under a burst of 200 effects', () => {
    const { scheduler } = setup(6);

    for (let index = 0; index < 200; index += 1) {
      scheduler.submit(effect(`spam-${index}`, 1));
    }

    expect(scheduler.stats.active).toBe(6);
    expect(scheduler.stats.dropped).toBeGreaterThan(0);
  });

  it('keeps the queue bounded', () => {
    const { scheduler } = setup(1, 4);

    for (let index = 0; index < 50; index += 1) {
      scheduler.submit(effect(`spam-${index}`, 1));
    }

    expect(scheduler.stats.pending).toBeLessThanOrEqual(4);
  });

  it('prefers heavier effects when the queue overflows', () => {
    const { scheduler, playing, advance } = setup(1, 2);

    scheduler.submit(effect('playing', 1, 5_000));
    scheduler.submit(effect('light-1', 1));
    scheduler.submit(effect('light-2', 1));
    // Queue is full of weight-1 effects; a weight-5 arrival must evict one of them.
    scheduler.submit(effect('heavy', 5));

    advance(5_100);

    expect(playing).toContain('heavy');
  });

  it('counts every dropped effect instead of losing it silently', () => {
    const { scheduler } = setup(1, 1);

    scheduler.submit(effect('playing', 3, 10_000));
    scheduler.submit(effect('queued', 3));
    scheduler.submit(effect('dropped-1', 1));
    scheduler.submit(effect('dropped-2', 1));

    expect(scheduler.stats.dropped).toBe(2);
  });
});

describe('budget changes', () => {
  it('stops the weakest effects when the budget shrinks', () => {
    const { scheduler, stopped } = setup(4);

    scheduler.submit(effect('w1', 1));
    scheduler.submit(effect('w5', 5));
    scheduler.submit(effect('w2', 2));
    scheduler.submit(effect('w4', 4));

    scheduler.setMaxConcurrent(2);

    expect(scheduler.stats.active).toBe(2);
    expect(stopped.sort()).toEqual(['w1', 'w2']);
    expect(scheduler.activeIds().sort()).toEqual(['w4', 'w5']);
  });

  it('never drops below one concurrent effect', () => {
    const { scheduler } = setup(3);

    scheduler.setMaxConcurrent(0);
    expect(scheduler.submit(effect('a', 1))).toBe(true);
  });

  it('clears everything on demand', () => {
    const { scheduler, stopped } = setup(3);

    scheduler.submit(effect('a', 1));
    scheduler.submit(effect('b', 1));
    scheduler.clear();

    expect(stopped.sort()).toEqual(['a', 'b']);
    expect(scheduler.stats.active).toBe(0);
    expect(scheduler.stats.pending).toBe(0);
  });
});
