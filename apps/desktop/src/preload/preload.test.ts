/**
 * Preload surface tests (Blueprint §42).
 *
 * These assert the SECURITY boundary, not just behaviour: the renderer must receive a fixed set of
 * high-level functions, no `ipcRenderer`, no channel-taking escape hatch, and no Electron event
 * objects leaking through listener callbacks.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposed = new Map<string, unknown>();
const invoke = vi.fn(() => Promise.resolve({ ok: true }));
const on = vi.fn();
const removeListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => exposed.set(key, value),
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invoke(...(args as [])),
    on: (...args: unknown[]) => on(...(args as [])),
    removeListener: (...args: unknown[]) => removeListener(...(args as [])),
  },
}));

type ControlBridge = Record<string, unknown> & {
  connect: (request: unknown) => Promise<unknown>;
  sendCommand: (command: unknown) => Promise<unknown>;
  stage: { open: () => Promise<unknown> };
  onGameEvent: (listener: (payload: unknown) => void) => () => void;
};

async function loadControlBridge(): Promise<ControlBridge> {
  await import('./control.js');
  return exposed.get('danceArena') as ControlBridge;
}

beforeEach(() => {
  exposed.clear();
  invoke.mockClear();
  on.mockClear();
  removeListener.mockClear();
  vi.resetModules();
});

describe('CONTROL preload', () => {
  it('exposes exactly the whitelisted API surface', async () => {
    const bridge = await loadControlBridge();

    expect(Object.keys(bridge).sort()).toEqual(
      [
        'autoHost',
        'bridgeVersion',
        'connect',
        'disconnect',
        'onAutoHostStatus',
        'onConnectorStatus',
        'onDiagnosticsError',
        'onGameEvent',
        'onStageWindowState',
        'ready',
        'sendCommand',
        'simulator',
        'stage',
      ].sort(),
    );
  });

  it('never exposes ipcRenderer, node or a generic channel invoker', async () => {
    const bridge = await loadControlBridge();
    const keys = Object.keys(bridge);

    // No escape hatch that would let a renderer name its own channel.
    for (const forbidden of ['ipcRenderer', 'invoke', 'send', 'sendSync', 'postMessage', 'on']) {
      expect(keys).not.toContain(forbidden);
    }

    expect(bridge.ipcRenderer).toBeUndefined();
    expect(bridge.require).toBeUndefined();
    expect(bridge.process).toBeUndefined();

    // Every exposed value is either the version marker, a function, or a namespace of functions.
    for (const [key, value] of Object.entries(bridge)) {
      if (key === 'bridgeVersion') continue;

      const isFunction = typeof value === 'function';
      const isFunctionNamespace =
        typeof value === 'object' &&
        value !== null &&
        Object.values(value).every((member) => typeof member === 'function');

      expect(isFunction || isFunctionNamespace).toBe(true);
    }
  });

  it('targets one fixed channel per method', async () => {
    const bridge = await loadControlBridge();

    await bridge.connect({ target: '@dancer' });
    expect(invoke).toHaveBeenCalledWith('connector:connect', { target: '@dancer' });

    await bridge.sendCommand({ type: 'game:clear-stage' });
    expect(invoke).toHaveBeenCalledWith('game:command', { type: 'game:clear-stage' });

    await bridge.stage.open();
    expect(invoke).toHaveBeenCalledWith('stage:open', {});
  });

  it('hands listeners the payload only, never the IpcRendererEvent', async () => {
    const bridge = await loadControlBridge();
    const received: unknown[] = [];

    const unsubscribe = bridge.onGameEvent((payload) => received.push(payload));

    const registration = on.mock.calls[0] as [string, (...args: unknown[]) => void] | undefined;
    expect(registration).toBeDefined();

    const [channel, handler] = registration ?? ['', () => undefined];
    expect(channel).toBe('game:event');

    handler({ sender: 'DANGEROUS_WEBCONTENTS' }, { type: 'game:queue-updated' });

    expect(received).toEqual([{ type: 'game:queue-updated' }]);

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith('game:event', handler);
  });
});

describe('STAGE preload', () => {
  it('exposes a render-and-speak surface with no command channel', async () => {
    await import('./stage.js');
    const bridge = exposed.get('danceArenaStage') as Record<string, unknown>;

    expect(Object.keys(bridge).sort()).toEqual(
      ['bridgeVersion', 'onEvent', 'onSnapshot', 'ready', 'tts'].sort(),
    );
    expect(bridge.sendCommand).toBeUndefined();
    expect(bridge.connect).toBeUndefined();
    expect(bridge.simulator).toBeUndefined();
  });

  it('gives STAGE a speech DEVICE, never queue control (Task 10 §6)', async () => {
    await import('./stage.js');
    const bridge = exposed.get('danceArenaStage') as { tts: Record<string, unknown> };

    expect(Object.keys(bridge.tts).sort()).toEqual(
      ['onCancel', 'onSpeak', 'reportAvailability', 'reportResult'].sort(),
    );

    // Nothing on the STAGE surface can enqueue, reorder, replay or read the Main-owned queue.
    for (const forbidden of ['enqueue', 'clear', 'getQueue', 'setPriority', 'speak']) {
      expect(bridge.tts[forbidden]).toBeUndefined();
    }
  });

  it('does not share the CONTROL bridge key', async () => {
    await import('./stage.js');

    expect(exposed.has('danceArena')).toBe(false);
  });
});
