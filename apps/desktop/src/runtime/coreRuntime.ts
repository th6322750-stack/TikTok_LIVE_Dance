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
  CommandResult,
  ControlInitialState,
  ControlInvokeChannel,
  ControlInvokeRequest,
  ControlInvokeResponse,
  EngineEvent,
  EventLogEntry,
  LiveEvent,
  StageSnapshot,
  StageWindowState,
} from '@dance-arena/contracts';
import { isStageEvent } from '@dance-arena/contracts';
import {
  createGameEngine,
  type Clock,
  type GameEngine,
  type IdGenerator,
} from '@dance-arena/core-engine';
import { createSimulator, type Simulator } from '@dance-arena/simulator';

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
}

export interface CoreRuntime {
  readonly engine: GameEngine;
  readonly simulator: Simulator;
  handleControlInvoke<C extends ControlInvokeChannel>(
    channel: C,
    request: ControlInvokeRequest<C>,
  ): Promise<ControlInvokeResponse<C>>;
  handleStageReady(): Promise<{ snapshot: StageSnapshot }>;
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

export function createCoreRuntime(options: CoreRuntimeOptions): CoreRuntime {
  let sinks = options.sinks ?? NULL_SINKS;
  const eventLog: EventLogEntry[] = [];
  let statsCancel: (() => void) | undefined;
  let disposed = false;

  const engine = createGameEngine({
    clock: options.clock,
    ...(options.ids === undefined ? {} : { ids: options.ids }),
  });

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

  // Engine output routing — by namespace only.
  engine.subscribe((event: EngineEvent) => {
    if (isStageEvent(event)) {
      sinks.stageEvent(event);
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
      engine.tick(options.clock.now());
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
      return { ok: true };
    },

    'game:command': (request) => {
      const result: CommandResult = engine.dispatchCommand(request);
      return Promise.resolve(result);
    },

    'stage:open': async () => {
      const state = await options.stageWindow.open();
      sinks.stageWindowState(state);
      return state;
    },

    'stage:close': async () => {
      const state = await options.stageWindow.close();
      sinks.stageWindowState(state);
      return state;
    },

    'stage:reload': async () => {
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
  };

  return {
    engine,
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

    /**
     * STAGE handshake: every load/reload gets a fresh snapshot, which is why a STAGE reload can
     * never lose game state — the state was never in STAGE (Blueprint §60).
     */
    handleStageReady(): Promise<{ snapshot: StageSnapshot }> {
      return Promise.resolve({ snapshot: engine.getStageSnapshot() });
    },

    getStageSnapshot: () => engine.getStageSnapshot(),

    setSinks(next: RuntimeSinks): void {
      sinks = next;
    },

    start(): void {
      scheduleStats();
    },

    async dispose(): Promise<void> {
      disposed = true;
      statsCancel?.();
      simulator.stop();
      await connectors.disconnect();
    },
  };
}

export type { StageWindowState };
