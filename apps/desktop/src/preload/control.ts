/**
 * CONTROL preload (Blueprint §42).
 *
 * SECURITY CONTRACT
 * - `ipcRenderer` is never exposed.
 * - No method takes a channel name from the renderer; every call targets one fixed channel, so a
 *   compromised renderer cannot address arbitrary IPC endpoints.
 * - Listener callbacks receive the PAYLOAD only — never the `IpcRendererEvent`, which would hand
 *   the renderer a `sender` reference back into Main.
 */

import type {
  CommandResult,
  ConnectorConnectRequest,
  ConnectorStatusEvent,
  ControlCommand,
  ControlEvent,
  ControlInitialState,
  DanceArenaControlBridge,
  DiagnosticsErrorPayload,
  SimulatorEmitRequest,
  SimulatorScenarioRequest,
  StageLayoutRequest,
  StageWindowState,
  Unsubscribe,
} from '@dance-arena/contracts';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);

  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const bridge: DanceArenaControlBridge = {
  bridgeVersion: 1,

  ready: (): Promise<ControlInitialState> => ipcRenderer.invoke('control:ready', {}),

  connect: (request: ConnectorConnectRequest): Promise<CommandResult> =>
    ipcRenderer.invoke('connector:connect', request),

  disconnect: (): Promise<CommandResult> => ipcRenderer.invoke('connector:disconnect', {}),

  sendCommand: (command: ControlCommand): Promise<CommandResult> =>
    ipcRenderer.invoke('game:command', command),

  stage: {
    open: (): Promise<StageWindowState> => ipcRenderer.invoke('stage:open', {}),
    close: (): Promise<StageWindowState> => ipcRenderer.invoke('stage:close', {}),
    reload: (): Promise<StageWindowState> => ipcRenderer.invoke('stage:reload', {}),
    setLayout: (request: StageLayoutRequest): Promise<StageWindowState> =>
      ipcRenderer.invoke('stage:set-layout', request),
  },

  simulator: {
    emit: (request: SimulatorEmitRequest): Promise<CommandResult> =>
      ipcRenderer.invoke('simulator:emit-event', request),
    startScenario: (request: SimulatorScenarioRequest): Promise<CommandResult> =>
      ipcRenderer.invoke('simulator:start-scenario', request),
    stop: (): Promise<CommandResult> => ipcRenderer.invoke('simulator:stop', {}),
  },

  onConnectorStatus: (listener: (status: ConnectorStatusEvent) => void): Unsubscribe =>
    subscribe('connector:status', listener),

  onGameEvent: (listener: (event: ControlEvent) => void): Unsubscribe =>
    subscribe('game:event', listener),

  onStageWindowState: (listener: (state: StageWindowState) => void): Unsubscribe =>
    subscribe('stage:window-state', listener),

  onDiagnosticsError: (listener: (error: DiagnosticsErrorPayload) => void): Unsubscribe =>
    subscribe('diagnostics:error', listener),
};

contextBridge.exposeInMainWorld('danceArena', bridge);
