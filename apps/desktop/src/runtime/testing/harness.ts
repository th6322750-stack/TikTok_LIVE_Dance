/**
 * Headless runtime harness.
 *
 * Builds the REAL composition root with fake ports (stage window, secrets, scheduler) so the whole
 * pipeline can be driven without Electron. Used by Task 04 and Task 08 tests.
 */

import { ManualScheduler, MockConnector, type Scheduler } from '@dance-arena/connectors';
import type {
  AutoHostConfig,
  AutoHostStatus,
  ConnectorStatusEvent,
  ControlEvent,
  DiagnosticsErrorPayload,
  LiveConnector,
  StageEvent,
  StageLayoutRequest,
  StageSnapshot,
  StageWindowState,
  TtsCancelRequest,
  TtsSpeakRequest,
} from '@dance-arena/contracts';
import { createFixedClock, createSequentialIdGenerator } from '@dance-arena/core-engine';

import { createCoreRuntime, type CoreRuntime } from '../coreRuntime.js';
import type { RuntimeSinks, SecretStore, StageWindowController } from '../ports.js';

export class FakeStageWindow implements StageWindowController {
  private state: StageWindowState = { open: false, alwaysOnTop: false };
  reloadCount = 0;

  open(): Promise<StageWindowState> {
    this.state = { ...this.state, open: true };
    return Promise.resolve(this.state);
  }

  close(): Promise<StageWindowState> {
    this.state = { ...this.state, open: false };
    return Promise.resolve(this.state);
  }

  reload(): Promise<StageWindowState> {
    this.reloadCount += 1;
    return Promise.resolve(this.state);
  }

  setLayout(request: StageLayoutRequest): Promise<StageWindowState> {
    this.state = {
      ...this.state,
      ...(request.alwaysOnTop === undefined ? {} : { alwaysOnTop: request.alwaysOnTop }),
      ...(request.bounds === undefined ? {} : { bounds: request.bounds }),
    };
    return Promise.resolve(this.state);
  }

  getState(): StageWindowState {
    return this.state;
  }
}

export interface RuntimeHarness {
  readonly runtime: CoreRuntime;
  readonly scheduler: ManualScheduler;
  readonly clock: ReturnType<typeof createFixedClock>;
  readonly stageWindow: FakeStageWindow;
  readonly controlEvents: ControlEvent[];
  readonly stageEvents: StageEvent[];
  readonly stageSnapshots: StageSnapshot[];
  readonly connectorStatuses: ConnectorStatusEvent[];
  readonly diagnostics: DiagnosticsErrorPayload[];
  readonly connectors: MockConnector[];
  readonly autoHostStatuses: AutoHostStatus[];
  /** Utterances Main handed to the STAGE speech device, in order. */
  readonly ttsRequests: TtsSpeakRequest[];
  readonly ttsCancels: TtsCancelRequest[];
  /** Simulates the STAGE renderer announcing whether Web Speech exists. */
  reportTtsAvailability(available: boolean, detail?: string): Promise<void>;
  /** Simulates the STAGE renderer acknowledging how one utterance ended. */
  reportTtsResult(
    requestId: string,
    status: 'completed' | 'interrupted' | 'unavailable' | 'error',
  ): Promise<void>;
  advance(ms: number): void;
  dispose(): Promise<void>;
}

export interface RuntimeHarnessOptions {
  readonly apiKey?: string;
  readonly startAt?: number;
  /**
   * Overrides connector construction so a test can drive the runtime with the REAL EulerStream
   * connector over a fake transport instead of the mock connector.
   */
  readonly createConnector?: (
    provider: string,
    scheduler: ManualScheduler,
  ) => LiveConnector | undefined;
  readonly autoHostConfig?: AutoHostConfig;
  /** When true the harness pretends no STAGE window is listening for speech. */
  readonly ttsUnreachable?: boolean;
}

export function createRuntimeHarness(options: RuntimeHarnessOptions = {}): RuntimeHarness {
  const startAt = options.startAt ?? 1_000;
  const scheduler = new ManualScheduler(startAt);
  const clock = createFixedClock(startAt);
  const stageWindow = new FakeStageWindow();

  const controlEvents: ControlEvent[] = [];
  const stageEvents: StageEvent[] = [];
  const stageSnapshots: StageSnapshot[] = [];
  const connectorStatuses: ConnectorStatusEvent[] = [];
  const diagnostics: DiagnosticsErrorPayload[] = [];
  const connectors: MockConnector[] = [];
  const autoHostStatuses: AutoHostStatus[] = [];
  const ttsRequests: TtsSpeakRequest[] = [];
  const ttsCancels: TtsCancelRequest[] = [];

  const sinks: RuntimeSinks = {
    connectorStatus: (status) => connectorStatuses.push(status),
    controlEvent: (event) => controlEvents.push(event),
    stageSnapshot: (snapshot) => stageSnapshots.push(snapshot),
    stageEvent: (event) => stageEvents.push(event),
    stageWindowState: () => undefined,
    diagnosticsError: (error) => diagnostics.push(error),
    autoHostStatus: (status) => autoHostStatuses.push(status),
    // Stands in for the STAGE window: records the utterance and reports whether it was delivered.
    ttsSpeak: (request) => {
      if (options.ttsUnreachable === true) return false;

      ttsRequests.push(request);
      return true;
    },
    ttsCancel: (request) => ttsCancels.push(request),
  };

  const secrets: SecretStore = {
    getApiKey: () => options.apiKey,
    hasApiKey: () => options.apiKey !== undefined,
  };

  const createConnector = (provider: string): LiveConnector => {
    const override = options.createConnector?.(provider, scheduler);
    if (override !== undefined) return override;

    const connector = new MockConnector({ scheduler: scheduler as Scheduler });
    connectors.push(connector);
    return connector;
  };

  const runtime = createCoreRuntime({
    clock,
    scheduler,
    ids: createSequentialIdGenerator(),
    createConnector,
    stageWindow,
    secrets,
    sinks,
    defaultProvider: 'mock',
    ...(options.autoHostConfig === undefined ? {} : { autoHostConfig: options.autoHostConfig }),
  });

  return {
    runtime,
    scheduler,
    clock,
    stageWindow,
    controlEvents,
    stageEvents,
    stageSnapshots,
    connectorStatuses,
    diagnostics,
    connectors,
    autoHostStatuses,
    ttsRequests,
    ttsCancels,

    async reportTtsAvailability(available: boolean, detail?: string): Promise<void> {
      await runtime.handleStageInvoke('autohost:tts-ready', {
        available,
        ...(detail === undefined ? {} : { detail }),
      });
    },

    async reportTtsResult(
      requestId: string,
      status: 'completed' | 'interrupted' | 'unavailable' | 'error',
    ): Promise<void> {
      await runtime.handleStageInvoke('autohost:tts-result', { requestId, status });
      // Let the queue's `.then` microtask run so the next utterance is already dispatched when a
      // test inspects `ttsRequests`.
      await Promise.resolve();
      await Promise.resolve();
    },

    advance(ms: number): void {
      clock.advance(ms);
      scheduler.advance(ms);
    },
    dispose: () => runtime.dispose(),
  };
}
