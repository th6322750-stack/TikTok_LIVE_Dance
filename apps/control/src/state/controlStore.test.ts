import type { ControlInitialState } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { EMPTY_SNAPSHOT, EMPTY_STATS } from '../testing/fakeBridge.js';
import {
  activeDancerCount,
  controlReducer,
  INITIAL_CONTROL_STATE,
  sessionDiamonds,
  topSupporterLabel,
} from './controlStore.js';

const initial: ControlInitialState = {
  snapshot: EMPTY_SNAPSHOT,
  connector: { provider: 'mock', status: 'connected', at: 1_000, target: '@dancer' },
  stats: EMPTY_STATS,
  stage: { open: true, alwaysOnTop: false },
  recentEvents: [],
  apiKeyConfigured: true,
};

describe('controlReducer', () => {
  it('adopts the initial state from the handshake', () => {
    const state = controlReducer(INITIAL_CONTROL_STATE, { type: 'bridge-ready', initial });

    expect(state.bridgeAvailable).toBe(true);
    expect(state.connector?.status).toBe('connected');
    expect(state.apiKeyConfigured).toBe(true);
    expect(state.stageWindow.open).toBe(true);
  });

  it('replaces queue and ranking from server events instead of computing them', () => {
    let state = controlReducer(INITIAL_CONTROL_STATE, { type: 'bridge-ready', initial });

    state = controlReducer(state, {
      type: 'game-event',
      event: {
        type: 'game:queue-updated',
        at: 2_000,
        queue: [
          {
            id: 'q1',
            userId: 'u1',
            joinedAt: 1_500,
            priorityScore: 10,
            diamondsWhileWaiting: 100,
          },
        ],
      },
    });

    state = controlReducer(state, {
      type: 'game-event',
      event: {
        type: 'game:ranking-updated',
        at: 2_100,
        ranking: {
          updatedAt: 2_100,
          entries: [{ rank: 1, userId: 'u1', totalDiamonds: 500 }],
        },
      },
    });

    expect(state.queue).toHaveLength(1);
    expect(state.ranking.entries[0]?.userId).toBe('u1');
  });

  it('keeps the newest feed entry first and caps the feed', () => {
    let state = controlReducer(INITIAL_CONTROL_STATE, { type: 'bridge-ready', initial });

    for (let index = 0; index < 120; index += 1) {
      state = controlReducer(state, {
        type: 'game-event',
        event: {
          type: 'game:event-log',
          entry: {
            id: `log-${index}`,
            at: index,
            level: 'info',
            kind: 'test',
            message: `entry ${index}`,
          },
        },
      });
    }

    expect(state.feed).toHaveLength(100);
    expect(state.feed[0]?.id).toBe('log-119');
  });

  it('renders a rejected command as a warning row', () => {
    const state = controlReducer(INITIAL_CONTROL_STATE, {
      type: 'game-event',
      event: {
        type: 'game:command-rejected',
        at: 5_000,
        command: 'JOIN_STAGE',
        userId: 'u9',
        reason: 'cooldown',
      },
    });

    expect(state.feed[0]?.level).toBe('warn');
    expect(state.feed[0]?.message).toContain('cooldown');
  });

  it('surfaces diagnostics errors', () => {
    const state = controlReducer(INITIAL_CONTROL_STATE, {
      type: 'diagnostics',
      error: { at: 1, scope: 'normalizer', message: 'bad payload' },
    });

    expect(state.lastError).toBe('bad payload');
  });

  it('marks the bridge as missing outside the desktop shell', () => {
    const state = controlReducer(INITIAL_CONTROL_STATE, { type: 'bridge-missing' });

    expect(state.bridgeAvailable).toBe(false);
  });
});

describe('selectors', () => {
  it('reads counters from the latest stats, falling back to the snapshot', () => {
    const state = controlReducer(INITIAL_CONTROL_STATE, {
      type: 'bridge-ready',
      initial: {
        ...initial,
        stats: {
          ...EMPTY_STATS,
          activeDancers: 7,
          counters: { ...EMPTY_STATS.counters, totalDiamonds: 1_200 },
        },
      },
    });

    expect(activeDancerCount(state)).toBe(7);
    expect(sessionDiamonds(state)).toBe(1_200);
  });

  it('shows a placeholder when there is no supporter yet', () => {
    expect(topSupporterLabel(INITIAL_CONTROL_STATE)).toBe('—');
  });

  it('labels the top supporter with the nickname from the snapshot', () => {
    const state = controlReducer(INITIAL_CONTROL_STATE, {
      type: 'bridge-ready',
      initial: {
        ...initial,
        snapshot: {
          ...EMPTY_SNAPSHOT,
          state: {
            ...EMPTY_SNAPSHOT.state,
            users: {
              u1: {
                id: 'u1',
                nickname: 'Top Fan',
                totalDiamonds: 900,
                giftCount: 2,
                follow: false,
                lastSeenAt: 1,
              },
            },
            ranking: { updatedAt: 1, entries: [{ rank: 1, userId: 'u1', totalDiamonds: 900 }] },
          },
        },
      },
    });

    expect(topSupporterLabel(state)).toContain('Top Fan');
  });
});
