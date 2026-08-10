/**
 * Runtime → renderer publisher.
 *
 * Implements `RuntimeSinks` on top of Electron windows. Sends are best-effort: a closed or
 * reloading window must never take the runtime down (Blueprint §62).
 */

import type {
  ConnectorStatusEvent,
  ControlEvent,
  DiagnosticsErrorPayload,
  StageEvent,
  StageSnapshot,
  StageWindowState,
} from '@dance-arena/contracts';
import type { BrowserWindow } from 'electron';

import type { RuntimeSinks } from '../../runtime/ports.js';

export interface WindowPublisherOptions {
  readonly getControlWindow: () => BrowserWindow | undefined;
  readonly getStageWindow: () => BrowserWindow | undefined;
}

export function createWindowPublisher(options: WindowPublisherOptions): RuntimeSinks {
  const send = (window: BrowserWindow | undefined, channel: string, payload: unknown): void => {
    if (window === undefined || window.isDestroyed()) return;
    if (window.webContents.isDestroyed() || window.webContents.isLoading()) return;

    window.webContents.send(channel, payload);
  };

  return {
    connectorStatus: (status: ConnectorStatusEvent) =>
      send(options.getControlWindow(), 'connector:status', status),

    controlEvent: (event: ControlEvent) => send(options.getControlWindow(), 'game:event', event),

    stageWindowState: (state: StageWindowState) =>
      send(options.getControlWindow(), 'stage:window-state', state),

    diagnosticsError: (error: DiagnosticsErrorPayload) =>
      send(options.getControlWindow(), 'diagnostics:error', error),

    stageSnapshot: (snapshot: StageSnapshot) =>
      send(options.getStageWindow(), 'stage:snapshot', snapshot),

    stageEvent: (event: StageEvent) => send(options.getStageWindow(), 'stage:event', event),
  };
}
