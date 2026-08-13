/**
 * Runtime → renderer publisher.
 *
 * Implements `RuntimeSinks` on top of Electron windows. Sends are best-effort: a closed or
 * reloading window must never take the runtime down (Blueprint §62).
 *
 * `ttsSpeak` is the one sink that reports back whether it reached a window. The Main-owned TTS
 * queue needs that answer: without it a closed STAGE would leave an utterance waiting forever for
 * an acknowledgement (Task 10 §6).
 */

import type {
  AutoHostStatus,
  ConnectorStatusEvent,
  ControlEvent,
  DiagnosticsErrorPayload,
  StageEvent,
  StageSnapshot,
  StageWindowState,
  TtsCancelRequest,
  TtsSpeakRequest,
} from '@dance-arena/contracts';
import type { BrowserWindow } from 'electron';

import type { RuntimeSinks } from '../../runtime/ports.js';

export interface WindowPublisherOptions {
  readonly getControlWindow: () => BrowserWindow | undefined;
  readonly getStageWindow: () => BrowserWindow | undefined;
}

export function createWindowPublisher(options: WindowPublisherOptions): RuntimeSinks {
  const canReceive = (window: BrowserWindow | undefined): window is BrowserWindow => {
    if (window === undefined || window.isDestroyed()) return false;
    return !window.webContents.isDestroyed() && !window.webContents.isLoading();
  };

  const send = (window: BrowserWindow | undefined, channel: string, payload: unknown): boolean => {
    if (!canReceive(window)) return false;

    window.webContents.send(channel, payload);
    return true;
  };

  return {
    connectorStatus: (status: ConnectorStatusEvent) => {
      send(options.getControlWindow(), 'connector:status', status);
    },

    controlEvent: (event: ControlEvent) => {
      send(options.getControlWindow(), 'game:event', event);
    },

    stageWindowState: (state: StageWindowState) => {
      send(options.getControlWindow(), 'stage:window-state', state);
    },

    diagnosticsError: (error: DiagnosticsErrorPayload) => {
      send(options.getControlWindow(), 'diagnostics:error', error);
    },

    autoHostStatus: (status: AutoHostStatus) => {
      send(options.getControlWindow(), 'autohost:status', status);
    },

    stageSnapshot: (snapshot: StageSnapshot) => {
      send(options.getStageWindow(), 'stage:snapshot', snapshot);
    },

    stageEvent: (event: StageEvent) => {
      send(options.getStageWindow(), 'stage:event', event);
    },

    ttsSpeak: (request: TtsSpeakRequest): boolean =>
      send(options.getStageWindow(), 'autohost:tts-speak', request),

    ttsCancel: (request: TtsCancelRequest) => {
      send(options.getStageWindow(), 'autohost:tts-cancel', request);
    },
  };
}
