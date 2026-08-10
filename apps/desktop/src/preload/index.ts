/**
 * Preload — Task 00 skeleton.
 *
 * Blueprint §42: renderers run with `nodeIntegration: false`, `contextIsolation: true` and
 * `sandbox: true`. This file is the ONLY bridge between renderer and Main, and it may expose a
 * whitelist of typed functions — never `ipcRenderer`, Node built-ins or raw Electron APIs.
 *
 * Task 04 defines the real `window.danceArena` surface from the typed IPC contracts.
 */

import { contextBridge } from 'electron';

const BRIDGE_KEY = 'danceArena';

/** Shape of the whitelist exposed to renderers. Task 04 extends this from contracts. */
export interface DanceArenaBridge {
  readonly bridgeVersion: 1;
}

const bridge: DanceArenaBridge = Object.freeze({ bridgeVersion: 1 });

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
