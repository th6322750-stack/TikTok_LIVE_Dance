/**
 * In-memory stand-in for the preload bridge.
 *
 * Lets CONTROL be tested exactly as it runs in production — through the same typed whitelist —
 * without Electron. Also records every call so tests can assert which typed command a button
 * emitted (Task 05 test requirement).
 */

import type {
  AutoHostConfig,
  AutoHostRuntimeState,
  AutoHostStatus,
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
  pushAutoHostStatus(status: AutoHostStatus): void;
}

/**
 * A tiny stand-in preset.
 *
 * Written from contracts alone on purpose: CONTROL depends on `@dance-arena/contracts` and nothing
 * else, so importing the Core Engine's shipped preset here would create the exact dependency the
 * architecture check forbids (Blueprint §67).
 */
export const FAKE_AUTO_HOST_CONFIG: AutoHostConfig = {
  enabled: true,
  reminderIntervalMs: 120_000,
  maxTextLength: 180,
  tts: { enabled: true, lang: 'vi-VN', rate: 1, pitch: 1, volume: 1 },
  queue: {
    maxQueued: 20,
    maxTextLength: 180,
    duplicateWindowMs: 8_000,
    ttlMs: { critical: 30_000, high: 25_000, normal: 20_000, low: 15_000 },
    interruptPolicy: 'lower-priority-only',
    maxRetries: 1,
  },
  rules: [
    {
      ruleId: 'follow-thanks',
      enabled: true,
      trigger: 'live:follow',
      priority: 40,
      conditions: [],
      cooldown: { globalMs: 4_000, perUserMs: 600_000 },
      actions: [
        {
          type: 'SHOW_ANNOUNCEMENT',
          template: 'Cảm ơn {user.nickname} đã follow!',
          level: 'info',
          durationMs: 3_500,
        },
        { type: 'TTS', template: 'Cảm ơn {user.nickname} đã follow!', priority: 'normal' },
      ],
    },
    {
      ruleId: 'join-welcome-bubble',
      enabled: true,
      trigger: 'live:join',
      priority: 15,
      conditions: [],
      cooldown: { globalMs: 1_500 },
      actions: [{ type: 'SHOW_BUBBLE', variant: 'join', durationMs: 2_500 }],
    },
  ],
};

export const EMPTY_AUTO_HOST_STATUS: AutoHostStatus = {
  at: 1_000,
  enabled: true,
  ttsEnabled: true,
  ttsAvailable: false,
  ttsUnavailableReason: 'stage not ready',
  pending: 0,
  metrics: {
    enqueued: 0,
    spoken: 0,
    suppressed: 0,
    dropped: 0,
    expired: 0,
    unavailable: 0,
    errors: 0,
    interrupted: 0,
  },
  engine: {
    enabled: true,
    ruleCount: 0,
    enabledRuleCount: 0,
    activeCooldowns: 0,
    evaluated: 0,
    matched: 0,
    intents: 0,
  },
  recentActions: [],
};

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
  const autoHostListeners = new Set<(status: AutoHostStatus) => void>();

  // Mirrors how Main behaves: every mutation answers with the state the fake now holds.
  let autoHostState: AutoHostRuntimeState = {
    config: FAKE_AUTO_HOST_CONFIG,
    status: EMPTY_AUTO_HOST_STATUS,
  };

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
    autoHost: {
      getState: () => {
        calls.push({ method: 'autoHost.getState' });
        return Promise.resolve(autoHostState);
      },
      updateConfig: (patch) => {
        calls.push({ method: 'autoHost.updateConfig', payload: patch });
        autoHostState = {
          ...autoHostState,
          config: { ...autoHostState.config, tts: { ...autoHostState.config.tts, ...patch.tts } },
        };
        return Promise.resolve(autoHostState);
      },
      setEnabled: (request) => {
        calls.push({ method: 'autoHost.setEnabled', payload: request });
        autoHostState = {
          ...autoHostState,
          config: { ...autoHostState.config, enabled: request.enabled },
        };
        return Promise.resolve(autoHostState);
      },
      setTtsEnabled: (request) => {
        calls.push({ method: 'autoHost.setTtsEnabled', payload: request });
        autoHostState = {
          ...autoHostState,
          config: {
            ...autoHostState.config,
            tts: { ...autoHostState.config.tts, enabled: request.enabled },
          },
        };
        return Promise.resolve(autoHostState);
      },
      updateRule: (patch) => {
        calls.push({ method: 'autoHost.updateRule', payload: patch });
        autoHostState = {
          ...autoHostState,
          config: {
            ...autoHostState.config,
            rules: autoHostState.config.rules.map((rule) =>
              rule.ruleId === patch.ruleId && patch.enabled !== undefined
                ? { ...rule, enabled: patch.enabled }
                : rule,
            ),
          },
        };
        return Promise.resolve(autoHostState);
      },
      testTts: (request) => Promise.resolve(record('autoHost.testTts', request)),
      clearTtsQueue: () => Promise.resolve(record('autoHost.clearTtsQueue')),
    },

    onConnectorStatus: (listener) => subscribe(connectorListeners, listener),
    onGameEvent: (listener) => subscribe(gameListeners, listener),
    onStageWindowState: (listener) => subscribe(stageListeners, listener),
    onDiagnosticsError: (listener) => subscribe(diagnosticsListeners, listener),
    onAutoHostStatus: (listener) => subscribe(autoHostListeners, listener),
  };

  return {
    bridge,
    calls,
    pushConnectorStatus: (status) => connectorListeners.forEach((listener) => listener(status)),
    pushGameEvent: (event) => gameListeners.forEach((listener) => listener(event)),
    pushStageWindowState: (state) => stageListeners.forEach((listener) => listener(state)),
    pushDiagnostics: (error) => diagnosticsListeners.forEach((listener) => listener(error)),
    pushAutoHostStatus: (status) => autoHostListeners.forEach((listener) => listener(status)),
  };
}
