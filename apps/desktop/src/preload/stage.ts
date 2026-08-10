/**
 * STAGE preload (Blueprint §42, §60).
 *
 * Even narrower than the CONTROL bridge: STAGE only renders, so it can request a snapshot and
 * listen for render events. It has no command channel at all — a compromised STAGE renderer
 * cannot mutate game state.
 */

import type {
  DanceArenaStageBridge,
  StageEvent,
  StageSnapshot,
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

const bridge: DanceArenaStageBridge = {
  bridgeVersion: 1,

  ready: (): Promise<{ snapshot: StageSnapshot }> => ipcRenderer.invoke('stage:ready', {}),

  onSnapshot: (listener: (snapshot: StageSnapshot) => void): Unsubscribe =>
    subscribe('stage:snapshot', listener),

  onEvent: (listener: (event: StageEvent) => void): Unsubscribe =>
    subscribe('stage:event', listener),
};

contextBridge.exposeInMainWorld('danceArenaStage', bridge);
