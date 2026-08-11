/**
 * Preload bridge surface (Blueprint §42).
 *
 * These are the ONLY functions a renderer can reach. `ipcRenderer` is never exposed, and no
 * channel name is ever passed in by a renderer — each method targets one fixed channel, so a
 * compromised renderer cannot address an arbitrary IPC endpoint.
 *
 * The interfaces live in contracts (not in apps/desktop) so CONTROL and STAGE can type
 * `window.danceArena` without importing from an app, which the dependency direction forbids
 * (Blueprint §67).
 */

import type { CommandResult, Unsubscribe } from '../common.js';
import type { ConnectorStatusEvent } from '../connector.js';
import type { ControlCommand } from '../game/commands.js';
import type { ControlEvent } from '../game/events.js';
import type { StageEvent, StageSnapshot } from '../stage/events.js';
import type {
  ConnectorConnectRequest,
  ControlInitialState,
  SimulatorEmitRequest,
  SimulatorScenarioRequest,
  StageLayoutRequest,
  StageWindowState,
} from './channels.js';

export interface DiagnosticsErrorPayload {
  readonly at: number;
  readonly scope: string;
  readonly message: string;
}

/** Exposed to the CONTROL renderer as `window.danceArena`. */
export interface DanceArenaControlBridge {
  readonly bridgeVersion: 1;

  /** Handshake: announces the renderer is mounted and returns the full initial state. */
  ready(): Promise<ControlInitialState>;

  connect(request: ConnectorConnectRequest): Promise<CommandResult>;
  disconnect(): Promise<CommandResult>;

  /** Sends an operator intent to the Core Engine. CONTROL never mutates state itself. */
  sendCommand(command: ControlCommand): Promise<CommandResult>;

  readonly stage: {
    open(): Promise<StageWindowState>;
    close(): Promise<StageWindowState>;
    reload(): Promise<StageWindowState>;
    setLayout(request: StageLayoutRequest): Promise<StageWindowState>;
  };

  readonly simulator: {
    emit(request: SimulatorEmitRequest): Promise<CommandResult>;
    startScenario(request: SimulatorScenarioRequest): Promise<CommandResult>;
    stop(): Promise<CommandResult>;
  };

  onConnectorStatus(listener: (status: ConnectorStatusEvent) => void): Unsubscribe;
  onGameEvent(listener: (event: ControlEvent) => void): Unsubscribe;
  onStageWindowState(listener: (state: StageWindowState) => void): Unsubscribe;
  onDiagnosticsError(listener: (error: DiagnosticsErrorPayload) => void): Unsubscribe;
}

/** Exposed to the STAGE renderer as `window.danceArenaStage`. */
export interface DanceArenaStageBridge {
  readonly bridgeVersion: 1;

  /**
   * Handshake after every load/reload. Main answers with a snapshot so a reloaded STAGE rebuilds
   * the scene without the canonical state ever living in the renderer (Blueprint §60).
   */
  ready(): Promise<{ snapshot: StageSnapshot }>;

  onSnapshot(listener: (snapshot: StageSnapshot) => void): Unsubscribe;
  onEvent(listener: (event: StageEvent) => void): Unsubscribe;
}
