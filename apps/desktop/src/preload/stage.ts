/**
 * STAGE preload (Blueprint §42, §60; Task 10 §6).
 *
 * Even narrower than the CONTROL bridge: STAGE only renders and speaks. It can request a snapshot,
 * listen for render events, receive ONE utterance at a time and acknowledge how that utterance
 * ended. It has no command channel and no queue access at all — a compromised STAGE renderer can
 * neither mutate game state nor reorder, replay or read the Main-owned TTS queue.
 */

import type {
  DanceArenaStageBridge,
  StageEvent,
  StageSnapshot,
  TtsAvailability,
  TtsCancelRequest,
  TtsSpeakRequest,
  TtsSpeakResult,
  Unsubscribe,
  CommandResult,
} from '@dance-arena/contracts';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);

  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const bridge: DanceArenaStageBridge = {
  bridgeVersion: 1,

  ready: (): Promise<{ snapshot: StageSnapshot }> => ipcRenderer.invoke('stage:ready', {}),

  onSnapshot: (listener: (snapshot: StageSnapshot) => void): Unsubscribe =>
    subscribe('stage:snapshot', listener),

  onEvent: (listener: (event: StageEvent) => void): Unsubscribe =>
    subscribe('stage:event', listener),

  tts: {
    reportAvailability: (availability: TtsAvailability): Promise<CommandResult> =>
      ipcRenderer.invoke('autohost:tts-ready', availability),

    reportResult: (result: TtsSpeakResult): Promise<CommandResult> =>
      ipcRenderer.invoke('autohost:tts-result', result),

    onSpeak: (listener: (request: TtsSpeakRequest) => void): Unsubscribe =>
      subscribe('autohost:tts-speak', listener),

    onCancel: (listener: (request: TtsCancelRequest) => void): Unsubscribe =>
      subscribe('autohost:tts-cancel', listener),
  },
};

contextBridge.exposeInMainWorld('danceArenaStage', bridge);
