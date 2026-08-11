/**
 * CONTROL view state.
 *
 * IMPORTANT: this is a PROJECTION, never the source of truth (Blueprint §3, Task 05 state rule).
 * The reducer only stores what Main sent. It never computes ranking, never mutates the queue and
 * never decides who is VIP — those answers arrive from the Core Engine.
 *
 * Written as a pure reducer so the whole update path is testable without React.
 */

import type {
  ConnectorStatusEvent,
  ControlEvent,
  ControlInitialState,
  DiagnosticsErrorPayload,
  EventLogEntry,
  GameSnapshot,
  QueueEntry,
  RankingState,
  SessionStats,
  StageWindowState,
} from '@dance-arena/contracts';

/** Feed rows kept in memory for the dev event feed. */
const FEED_CAPACITY = 100;

export interface ControlViewState {
  readonly bridgeAvailable: boolean;
  readonly connector: ConnectorStatusEvent | undefined;
  readonly snapshot: GameSnapshot | undefined;
  readonly stats: SessionStats | undefined;
  readonly queue: readonly QueueEntry[];
  readonly ranking: RankingState;
  readonly feed: readonly EventLogEntry[];
  readonly stageWindow: StageWindowState;
  readonly apiKeyConfigured: boolean;
  readonly lastError: string | undefined;
}

export const INITIAL_CONTROL_STATE: ControlViewState = {
  bridgeAvailable: false,
  connector: undefined,
  snapshot: undefined,
  stats: undefined,
  queue: [],
  ranking: { entries: [], updatedAt: 0 },
  feed: [],
  stageWindow: { open: false, alwaysOnTop: false },
  apiKeyConfigured: false,
  lastError: undefined,
};

export type ControlAction =
  | { readonly type: 'bridge-ready'; readonly initial: ControlInitialState }
  | { readonly type: 'bridge-missing' }
  | { readonly type: 'connector-status'; readonly status: ConnectorStatusEvent }
  | { readonly type: 'game-event'; readonly event: ControlEvent }
  | { readonly type: 'stage-window'; readonly state: StageWindowState }
  | { readonly type: 'diagnostics'; readonly error: DiagnosticsErrorPayload };

function appendFeed(
  feed: readonly EventLogEntry[],
  entry: EventLogEntry,
): readonly EventLogEntry[] {
  const next = [entry, ...feed];
  return next.length > FEED_CAPACITY ? next.slice(0, FEED_CAPACITY) : next;
}

export function controlReducer(state: ControlViewState, action: ControlAction): ControlViewState {
  switch (action.type) {
    case 'bridge-ready':
      return {
        ...state,
        bridgeAvailable: true,
        snapshot: action.initial.snapshot,
        connector: action.initial.connector,
        stats: action.initial.stats,
        queue: action.initial.snapshot.state.queue,
        ranking: action.initial.snapshot.state.ranking,
        stageWindow: action.initial.stage,
        apiKeyConfigured: action.initial.apiKeyConfigured,
        // Newest first, matching how the feed renders.
        feed: [...action.initial.recentEvents].reverse(),
      };

    case 'bridge-missing':
      return { ...state, bridgeAvailable: false };

    case 'connector-status':
      return { ...state, connector: action.status };

    case 'stage-window':
      return { ...state, stageWindow: action.state };

    case 'diagnostics':
      return { ...state, lastError: action.error.message };

    case 'game-event':
      return applyGameEvent(state, action.event);
  }
}

function applyGameEvent(state: ControlViewState, event: ControlEvent): ControlViewState {
  switch (event.type) {
    case 'game:snapshot':
      return {
        ...state,
        snapshot: event.snapshot,
        queue: event.snapshot.state.queue,
        ranking: event.snapshot.state.ranking,
      };

    case 'game:queue-updated':
      return { ...state, queue: event.queue };

    case 'game:ranking-updated':
      return { ...state, ranking: event.ranking };

    case 'game:session-stats':
      return { ...state, stats: event.stats };

    case 'game:event-log':
      return { ...state, feed: appendFeed(state.feed, event.entry) };

    case 'game:live-event':
      return {
        ...state,
        feed: appendFeed(state.feed, {
          id: `live-${event.at}-${event.userId}`,
          at: event.at,
          level: 'info',
          kind: event.eventType,
          message:
            event.diamonds === undefined
              ? `${event.nickname} → ${event.eventType}`
              : `${event.nickname} sent ${event.diamonds}💎`,
          userId: event.userId,
          nickname: event.nickname,
        }),
      };

    case 'game:command-rejected':
      return {
        ...state,
        feed: appendFeed(state.feed, {
          id: `rejected-${event.at}-${event.userId}`,
          at: event.at,
          level: 'warn',
          kind: 'command-rejected',
          message: `${event.command} rejected (${event.reason})`,
          userId: event.userId,
        }),
      };

    case 'game:command-accepted':
      return {
        ...state,
        feed: appendFeed(state.feed, {
          id: `accepted-${event.at}-${event.userId}`,
          at: event.at,
          level: 'info',
          kind: 'command',
          message: `${event.command} accepted`,
          userId: event.userId,
        }),
      };

    case 'game:user-updated':
      return state;
  }
}

// ── selectors (presentation-only derivations) ─────────────────────────────────────────────────

export function activeDancerCount(state: ControlViewState): number {
  return state.stats?.activeDancers ?? state.snapshot?.state.dancers.length ?? 0;
}

export function sessionDiamonds(state: ControlViewState): number {
  return state.stats?.counters.totalDiamonds ?? state.snapshot?.state.counters.totalDiamonds ?? 0;
}

export function topSupporterLabel(state: ControlViewState): string {
  const top = state.stats?.topSupporter ?? state.ranking.entries[0];
  if (top === undefined) return '—';

  const nickname = state.snapshot?.state.users[top.userId]?.nickname ?? top.userId;
  return `${nickname} · ${top.totalDiamonds}💎`;
}

export function nicknameOf(state: ControlViewState, userId: string): string {
  return state.snapshot?.state.users[userId]?.nickname ?? userId;
}
