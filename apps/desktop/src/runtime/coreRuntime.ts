/**
 * CoreRuntime — the composition root (Blueprint §4, §57–§61).
 *
 * Wires: Connector → Normalizer → Core Engine → CONTROL / STAGE.
 *
 * It contains no gameplay rules of its own; it routes. Engine output is split purely by channel
 * namespace (`stage:*` → STAGE window, `game:*` → CONTROL window), so Main never has to know what
 * a gift or a VIP promotion means.
 *
 * Electron-free by design: everything platform-specific arrives through ports, which is what lets
 * the Task 08 integration tests drive the real pipeline headlessly.
 */

import {
  createNormalizerRegistry,
  MockConnector,
  type NormalizerRegistry,
  type Scheduler,
} from '@dance-arena/connectors';
import type {
  AutoHostConfig,
  AutoHostTrigger,
  CommandResult,
  ControlInitialState,
  ControlInvokeChannel,
  ControlInvokeRequest,
  ControlInvokeResponse,
  EngineEvent,
  EventLogEntry,
  LiveEvent,
  StageInvokeChannel,
  StageInvokeRequest,
  StageInvokeResponse,
  StageSnapshot,
  StageWindowState,
  TtsAvailability,
  TtsSpeakResult,
} from '@dance-arena/contracts';
import { isHostTriggerEvent, isStageEvent } from '@dance-arena/contracts';
import {
  createGameEngine,
  createSequentialIdGenerator,
  type Clock,
  type GameEngine,
  type IdGenerator,
} from '@dance-arena/core-engine';
import { createSimulator, type Simulator } from '@dance-arena/simulator';

import { createAutoHostService, type AutoHostService } from './autohost/autoHostService.js';
import { createStageTtsProvider, type StageTtsProvider } from './autohost/stageTtsProvider.js';
import {
  ConnectorManager,
  type ConnectorFactory,
  type ConnectorProvider,
} from './connectorManager.js';
import {
  NULL_SINKS,
  type RuntimeSinks,
  type SecretStore,
  type StageWindowController,
} from './ports.js';

/** How often CONTROL statistics are published (Blueprint §63: 4–10 updates/s). */
const STATS_INTERVAL_MS = 250;

/** Size of the CONTROL event feed replayed on handshake. */
const EVENT_LOG_CAPACITY = 50;

export interface CoreRuntimeOptions {
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly ids?: IdGenerator;
  readonly createConnector: ConnectorFactory;
  readonly stageWindow: StageWindowController;
  readonly secrets: SecretStore;
  readonly normalizer?: NormalizerRegistry;
  readonly sinks?: RuntimeSinks;
  /** Provider used when CONTROL does not name one. */
  readonly defaultProvider?: ConnectorProvider;
  /** Overrides the shipped Vietnamese Auto Host preset (tests, future persistence in Task 12). */
  readonly autoHostConfig?: AutoHostConfig;
}

export interface CoreRuntime {
  readonly engine: GameEngine;
  readonly simulator: Simulator;
  readonly autoHost: AutoHostService;
  handleControlInvoke<C extends ControlInvokeChannel>(
    channel: C,
    request: ControlInvokeRequest<C>,
  ): Promise<ControlInvokeResponse<C>>;
  handleStageInvoke<C extends StageInvokeChannel>(
    channel: C,
    request: StageInvokeRequest<C>,
  ): Promise<StageInvokeResponse<C>>;
  handleStageReady(): Promise<{ snapshot: StageSnapshot }>;
  /** STAGE window closed or started reloading: settle any utterance waiting on it. */
  handleStageGone(reason: string): void;
  setSinks(sinks: RuntimeSinks): void;
  getStageSnapshot(): StageSnapshot;
  start(): void;
  dispose(): Promise<void>;
}

/** One well-typed handler per channel — the request and response types are checked per entry. */
type ControlHandlers = {
  [C in ControlInvokeChannel]: (
    request: ControlInvokeRequest<C>,
  ) => Promise<ControlInvokeResponse<C>>;
};

type StageHandlers = {
  [C in StageInvokeChannel]: (request: StageInvokeRequest<C>) => Promise<StageInvokeResponse<C>>;
};

export function createCoreRuntime(options: CoreRuntimeOptions): CoreRuntime {
  let sinks = options.sinks ?? NULL_SINKS;
  const eventLog: EventLogEntry[] = [];
  let statsCancel: (() => void) | undefined;
  let disposed = false;

  // One id source for the whole composition: counters are per prefix, so engine ids
  // (`dancer-…`, `queue-…`) and Auto Host ids (`tts-…`, `host-overlay-…`) never collide.
  const ids = options.ids ?? createSequentialIdGenerator();

  const engine = createGameEngine({ clock: options.clock, ids });

  const connectors = new ConnectorManager({
    scheduler: options.scheduler,
    createConnector: options.createConnector,
    normalizer: options.normalizer ?? createNormalizerRegistry(),
    onEvent: (event: LiveEvent) => engine.handleEvent(event),
    onStatus: (status) => sinks.connectorStatus(status),
    onDropped: (reason, detail) => {
      if (reason !== 'invalid') return;

      // A malformed provider payload is a diagnostics signal, never a crash (Blueprint §62).
      sinks.diagnosticsError({
        at: options.clock.now(),
        scope: 'normalizer',
        message: `Dropped malformed provider payload: ${detail ?? 'unknown reason'}`,
      });
    },
  });

  // ── Auto Host (Task 10) ─────────────────────────────────────────────────────────────────────
  //
  // The speech device is the STAGE window; the QUEUE stays here in Main. `ttsSpeak` returns false
  // when no STAGE window is listening, which is how a closed stage becomes a typed `unavailable`
  // result instead of a stalled queue.
  const ttsProvider: StageTtsProvider = createStageTtsProvider({
    scheduler: options.scheduler,
    send: (request) => sinks.ttsSpeak(request),
    sendCancel: (request) => sinks.ttsCancel(request),
  });

  const autoHost = createAutoHostService({
    clock: options.clock,
    ids,
    scheduler: options.scheduler,
    provider: ttsProvider,
    ...(options.autoHostConfig === undefined ? {} : { config: options.autoHostConfig }),
    emitStageEvent: (event) => sinks.stageEvent(event),
    // A spotlight is requested through the CANONICAL command path, so the engine keeps ownership
    // of spotlight state and Auto Host never writes game state itself (Task 10 §10.9).
    startSpotlight: (userId, durationMs) => {
      engine.dispatchCommand({ type: 'game:start-spotlight', userId, durationMs });
    },
    publishStatus: (status) => sinks.autoHostStatus(status),
    isSessionActive: () => connectors.getStatus().status === 'connected',
  });

  /**
   * Triggers are drained through a queue rather than handled inline.
   *
   * A trigger arrives while the engine is flushing its event batch, and dispatching an intent may
   * send another command back into the engine (a spotlight). Draining keeps that re-entrancy
   * deterministic instead of interleaving two flushes.
   */
  const pendingTriggers: AutoHostTrigger[] = [];
  let drainingTriggers = false;

  function enqueueTrigger(trigger: AutoHostTrigger): void {
    pendingTriggers.push(trigger);
    if (drainingTriggers) return;

    drainingTriggers = true;
    try {
      for (;;) {
        const next = pendingTriggers.shift();
        if (next === undefined) break;
        autoHost.handleTrigger(next);
      }
    } finally {
      drainingTriggers = false;
    }
  }

  // Engine output routing — by namespace only.
  engine.subscribe((event: EngineEvent) => {
    if (isStageEvent(event)) {
      sinks.stageEvent(event);
      return;
    }

    // `host:*` never crosses an IPC boundary: it is consumed by the Auto Host rule engine here.
    if (isHostTriggerEvent(event)) {
      enqueueTrigger(event.trigger);
      return;
    }

    if (event.type === 'game:event-log') {
      eventLog.push(event.entry);
      if (eventLog.length > EVENT_LOG_CAPACITY) eventLog.shift();
    }

    sinks.controlEvent(event);
  });

  // The simulator always drives a MockConnector, never the engine directly (Blueprint §53).
  let simulator: Simulator = createSimulator({
    connector: new MockConnector({ scheduler: options.scheduler }),
    scheduler: options.scheduler,
  });

  function rebindSimulator(connector: MockConnector): void {
    simulator = createSimulator({ connector, scheduler: options.scheduler });
  }

  /** Simulator traffic must enter through a connected MockConnector, so attach one if needed. */
  async function ensureSimulatorConnector(): Promise<void> {
    const active = connectors.getMockConnector();
    if (active !== undefined) {
      rebindSimulator(active);
      return;
    }

    await connectors.connect('mock', { target: 'simulator' });
    const attached = connectors.getMockConnector();
    if (attached !== undefined) rebindSimulator(attached);
  }

  function publishStats(): void {
    sinks.controlEvent({
      type: 'game:session-stats',
      at: options.clock.now(),
      stats: engine.getStats(),
    });
  }

  function scheduleStats(): void {
    if (disposed) return;

    statsCancel = options.scheduler.schedule(STATS_INTERVAL_MS, () => {
      const now = options.clock.now();
      engine.tick(now);
      // Same cadence drives the TTS TTL sweep and the throttled Auto Host status push, so no
      // extra timer is introduced for UI metrics (Task 10 §7).
      autoHost.tick(now);
      publishStats();
      scheduleStats();
    });
  }

  function buildInitialState(): ControlInitialState {
    return {
      snapshot: engine.getSnapshot(),
      connector: connectors.getStatus(),
      stats: engine.getStats(),
      stage: options.stageWindow.getState(),
      recentEvents: [...eventLog],
      // Only the PRESENCE of the key ever reaches a renderer (Blueprint §45).
      apiKeyConfigured: options.secrets.hasApiKey(),
    };
  }

  const handlers: ControlHandlers = {
    'control:ready': () => Promise.resolve(buildInitialState()),

    'connector:connect': async (request) => {
      const provider = request.provider ?? options.defaultProvider ?? 'mock';
      const apiKey = options.secrets.getApiKey();

      try {
        await connectors.connect(provider, {
          target: request.target,
          // The key comes from secret storage in Main; a renderer can never supply it.
          ...(apiKey === undefined ? {} : { apiKey }),
        });

        const mock = connectors.getMockConnector();
        if (mock !== undefined) rebindSimulator(mock);

        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'connect failed' };
      }
    },

    'connector:disconnect': async () => {
      await connectors.disconnect();
      // An operator disconnect ends the session's host work: a thank-you queued seconds ago must
      // not be spoken after the LIVE is over (Task 10 §6 "Reload/disconnect"). A short connector
      // reconnect does NOT come through here, so canonical state survives it untouched.
      autoHost.clearTtsQueue();
      return { ok: true };
    },

    'game:command': (request) => {
      const result: CommandResult = engine.dispatchCommand(request);

      // A session reset clears canonical state; the host's cooldowns and pending speech belong to
      // that session and go with it.
      if (request.type === 'game:reset-session') autoHost.resetSession();

      return Promise.resolve(result);
    },

    'stage:open': async () => {
      const state = await options.stageWindow.open();
      sinks.stageWindowState(state);
      return state;
    },

    'stage:close': async () => {
      // Settle before the window goes: the queue must never wait on a device that is gone.
      ttsProvider.handleStageGone('stage window closed');
      const state = await options.stageWindow.close();
      sinks.stageWindowState(state);
      return state;
    },

    'stage:reload': async () => {
      // A STAGE reload interrupts the current utterance; the queue decides whether to retry it
      // once or drop it, and canonical Core state is untouched (Task 10 §6).
      ttsProvider.handleStageGone('stage window reloading');
      const state = await options.stageWindow.reload();
      sinks.stageWindowState(state);
      return state;
    },

    'stage:set-layout': async (request) => {
      const state = await options.stageWindow.setLayout(request);
      sinks.stageWindowState(state);
      return state;
    },

    'simulator:emit-event': async (request) => {
      await ensureSimulatorConnector();
      return simulator.emit(request) ? { ok: true } : { ok: false, reason: 'unknown preset' };
    },

    'simulator:start-scenario': async (request) => {
      await ensureSimulatorConnector();
      const started = simulator.startScenario(request.scenarioId, request.speed ?? 1);
      return started
        ? { ok: true }
        : { ok: false, reason: `unknown scenario ${request.scenarioId}` };
    },

    'simulator:stop': () => {
      simulator.stop();
      return Promise.resolve({ ok: true });
    },

    // ── Auto Host runtime configuration (Task 10 §7) ──────────────────────────────────────────
    'autohost:get-state': () => Promise.resolve(autoHost.getState()),
    'autohost:update-config': (request) => Promise.resolve(autoHost.updateConfig(request)),
    'autohost:set-enabled': (request) => Promise.resolve(autoHost.setEnabled(request.enabled)),
    'autohost:set-tts-enabled': (request) =>
      Promise.resolve(autoHost.setTtsEnabled(request.enabled)),
    'autohost:update-rule': (request) => Promise.resolve(autoHost.updateRule(request)),
    'autohost:test-tts': (request) => Promise.resolve(autoHost.testTts(request)),
    'autohost:clear-tts-queue': () => Promise.resolve(autoHost.clearTtsQueue()),
  };

  const stageHandlers: StageHandlers = {
    /**
     * STAGE handshake: every load/reload gets a fresh snapshot, which is why a STAGE reload can
     * never lose game state — the state was never in STAGE (Blueprint §60).
     */
    'stage:ready': () => Promise.resolve({ snapshot: engine.getStageSnapshot() }),

    'autohost:tts-ready': (request: TtsAvailability) => {
      ttsProvider.setAvailability(request);
      return Promise.resolve({ ok: true });
    },

    'autohost:tts-result': (request: TtsSpeakResult) => {
      // The ONLY thing STAGE may say about speech: how one utterance ended.
      ttsProvider.resolve(request);
      return Promise.resolve({ ok: true });
    },
  };

  return {
    engine,
    autoHost,
    get simulator(): Simulator {
      return simulator;
    },

    handleControlInvoke<C extends ControlInvokeChannel>(
      channel: C,
      request: ControlInvokeRequest<C>,
    ): Promise<ControlInvokeResponse<C>> {
      const handler = handlers[channel] as (
        request: ControlInvokeRequest<C>,
      ) => Promise<ControlInvokeResponse<C>>;

      return handler(request);
    },

    handleStageInvoke<C extends StageInvokeChannel>(
      channel: C,
      request: StageInvokeRequest<C>,
    ): Promise<StageInvokeResponse<C>> {
      const handler = stageHandlers[channel] as (
        request: StageInvokeRequest<C>,
      ) => Promise<StageInvokeResponse<C>>;

      return handler(request);
    },

    handleStageReady(): Promise<{ snapshot: StageSnapshot }> {
      return Promise.resolve({ snapshot: engine.getStageSnapshot() });
    },

    handleStageGone(reason: string): void {
      ttsProvider.handleStageGone(reason);
    },

    getStageSnapshot: () => engine.getStageSnapshot(),

    setSinks(next: RuntimeSinks): void {
      sinks = next;
    },

    start(): void {
      scheduleStats();
      autoHost.start();
    },

    async dispose(): Promise<void> {
      disposed = true;
      statsCancel?.();
      autoHost.dispose();
      ttsProvider.dispose();
      simulator.stop();
      await connectors.disconnect();
    },
  };
}

export type { StageWindowState };
