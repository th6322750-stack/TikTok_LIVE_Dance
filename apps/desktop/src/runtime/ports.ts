/**
 * Ports the runtime talks to instead of touching Electron directly.
 *
 * This is what keeps `CoreRuntime` — the whole gameplay composition — testable without launching
 * a browser window, and keeps gameplay out of `main.ts` (Blueprint §4).
 */

import type {
  AutoHostStatus,
  ConnectorStatusEvent,
  ControlEvent,
  DiagnosticsErrorPayload,
  StageEvent,
  StageLayoutRequest,
  StageSnapshot,
  StageWindowState,
  TtsCancelRequest,
  TtsSpeakRequest,
} from '@dance-arena/contracts';

/** Where runtime output goes. Implemented by the Electron window layer in production. */
export interface RuntimeSinks {
  connectorStatus(status: ConnectorStatusEvent): void;
  controlEvent(event: ControlEvent): void;
  stageSnapshot(snapshot: StageSnapshot): void;
  stageEvent(event: StageEvent): void;
  stageWindowState(state: StageWindowState): void;
  diagnosticsError(error: DiagnosticsErrorPayload): void;
  /** Throttled Auto Host summary for CONTROL. */
  autoHostStatus(status: AutoHostStatus): void;
  /**
   * Hands ONE utterance to the STAGE speech device.
   *
   * Returns false when no STAGE window can receive it, so the Main-owned queue can settle the item
   * as `unavailable` instead of waiting for an acknowledgement that will never arrive.
   */
  ttsSpeak(request: TtsSpeakRequest): boolean;
  ttsCancel(request: TtsCancelRequest): void;
}

/** Window operations the runtime may request. Implemented by WindowManager. */
export interface StageWindowController {
  open(): Promise<StageWindowState>;
  close(): Promise<StageWindowState>;
  reload(): Promise<StageWindowState>;
  setLayout(request: StageLayoutRequest): Promise<StageWindowState>;
  getState(): StageWindowState;
}

/**
 * Secret storage (Blueprint §45).
 *
 * The runtime only ever asks whether a key exists, or hands it straight to the connector. It is
 * never returned to a renderer and never logged.
 */
export interface SecretStore {
  getApiKey(): string | undefined;
  hasApiKey(): boolean;
}

export const NULL_SINKS: RuntimeSinks = {
  connectorStatus: () => undefined,
  controlEvent: () => undefined,
  stageSnapshot: () => undefined,
  stageEvent: () => undefined,
  stageWindowState: () => undefined,
  diagnosticsError: () => undefined,
  autoHostStatus: () => undefined,
  ttsSpeak: () => false,
  ttsCancel: () => undefined,
};
