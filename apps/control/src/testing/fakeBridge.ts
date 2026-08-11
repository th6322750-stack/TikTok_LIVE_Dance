/**
 * In-memory stand-in for the preload bridge.
 *
 * Lets CONTROL be tested exactly as it runs in production — through the same typed whitelist —
 * without Electron. Also records every call so tests can assert which typed command a button
 * emitted (Task 05 test requirement).
 */

import type {
  CommandResult,
  ConnectorStatusEvent,
  ControlCommand,
  ControlEvent,
  ControlInitialState,
  DanceArenaControlBridge,
  DiagnosticsErrorPayload,
  GameSnapshot,
  SessionStats,
  SimulatorEmitRequest,
  SimulatorScenarioRequest,
  StageLayoutRequest,
  StageWindowState,
  Unsubscribe,
} from '@dance-arena/contracts';

export interface RecordedCall {
  readonly method: string;
  readonly payload?: unknown;
}

export interface FakeBridge {
  readonly bridge: DanceArenaControlBridge;
  readonly calls: RecordedCall[];
  pushConnectorStatus(status: ConnectorStatusEvent): void;
  pushGameEvent(event: ControlEvent): void;
  pushStageWindowState(state: StageWindowState): void;
  pushDiagnostics(error: DiagnosticsErrorPayload): void;
}

export const EMPTY_SNAPSHOT: GameSnapshot = {
  version: 1,
  generatedAt: 1_000,
  state: {
    session: { sessionId: 'session-1', status: 'active', startedAt: 1_000 },
    users: {},
    dancers: [],
    queue: [],
    ranking: { entries: [], updatedAt: 1_000 },
    vip: { userIds: [], capacity: 10 },
    partyGoal: { enabled: true, current: 0, target: 5_000, completedCount: 0 },
    counters: {
      totalDiamonds: 0,
      giftCount: 0,
      commentCount: 0,
      followCount: 0,
      shareCount: 0,
      joinCount: 0,
      likeCount: 0,
      eventCount: 0,
    },
  },
};

export const EMPTY_STATS: SessionStats = {
  session: EMPTY_SNAPSHOT.state.session,
  counters: EMPTY_SNAPSHOT.state.counters,
  activeDancers: 0,
  queueLength: 0,
  partyGoal: EMPTY_SNAPSHOT.state.partyGoal,
};

export function createFakeBridge(initial?: Partial<ControlInitialState>): FakeBridge {
  const calls: RecordedCall[] = [];

  const connectorListeners = new Set<(status: ConnectorStatusEvent) => void>();
  const gameListeners = new Set<(event: ControlEvent) => void>();
  const stageListeners = new Set<(state: StageWindowState) => void>();
  const diagnosticsListeners = new Set<(error: DiagnosticsErrorPayload) => void>();

  const initialState: ControlInitialState = {
    snapshot: EMPTY_SNAPSHOT,
    connector: { provider: 'mock', status: 'idle', at: 1_000 },
    stats: EMPTY_STATS,
    stage: { open: false, alwaysOnTop: false },
    recentEvents: [],
    apiKeyConfigured: false,
    ...initial,
  };

  const record = (method: string, payload?: unknown): CommandResult => {
    calls.push(payload === undefined ? { method } : { method, payload });
    return { ok: true };
  };

  const subscribe = <T>(
    set: Set<(value: T) => void>,
    listener: (value: T) => void,
  ): Unsubscribe => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };

  const bridge: DanceArenaControlBridge = {
    bridgeVersion: 1,
    ready: () => {
      calls.push({ method: 'ready' });
      return Promise.resolve(initialState);
    },
    connect: (request) => Promise.resolve(record('connect', request)),
    disconnect: () => Promise.resolve(record('disconnect')),
    sendCommand: (command: ControlCommand) => Promise.resolve(record('sendCommand', command)),
    stage: {
      open: () => {
        record('stage.open');
        return Promise.resolve(initialState.stage);
      },
      close: () => {
        record('stage.close');
        return Promise.resolve(initialState.stage);
      },
      reload: () => {
        record('stage.reload');
        return Promise.resolve(initialState.stage);
      },
      setLayout: (request: StageLayoutRequest) => {
        record('stage.setLayout', request);
        return Promise.resolve(initialState.stage);
      },
    },
    simulator: {
      emit: (request: SimulatorEmitRequest) => Promise.resolve(record('simulator.emit', request)),
      startScenario: (request: SimulatorScenarioRequest) =>
        Promise.resolve(record('simulator.startScenario', request)),
      stop: () => Promise.resolve(record('simulator.stop')),
    },
    onConnectorStatus: (listener) => subscribe(connectorListeners, listener),
    onGameEvent: (listener) => subscribe(gameListeners, listener),
    onStageWindowState: (listener) => subscribe(stageListeners, listener),
    onDiagnosticsError: (listener) => subscribe(diagnosticsListeners, listener),
  };

  return {
    bridge,
    calls,
    pushConnectorStatus: (status) => connectorListeners.forEach((listener) => listener(status)),
    pushGameEvent: (event) => gameListeners.forEach((listener) => listener(event)),
    pushStageWindowState: (state) => stageListeners.forEach((listener) => listener(state)),
    pushDiagnostics: (error) => diagnosticsListeners.forEach((listener) => listener(error)),
  };
}
