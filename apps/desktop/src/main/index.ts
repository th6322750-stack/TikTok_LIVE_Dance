/**
 * Electron Main entry point — AppLifecycleManager (Blueprint §4, §59).
 *
 * Startup order follows Blueprint §59: environment → runtime → IPC → CONTROL window. The connector
 * is NEVER opened before the UI.
 *
 * There is no gameplay logic in this file. It composes services and hands events to the runtime.
 */

import { join } from 'node:path';

import { createRealScheduler, MockConnector, type Scheduler } from '@dance-arena/connectors';
import type { LiveConnector } from '@dance-arena/contracts';
import { createSequentialIdGenerator, type Clock } from '@dance-arena/core-engine';
import { app, BrowserWindow } from 'electron';

import { createCoreRuntime, type CoreRuntime } from '../runtime/coreRuntime.js';
import { resolveRuntimeMode, type RuntimeMode } from './environment.js';
import { IpcRouter } from './ipc/ipcRouter.js';
import { createWindowPublisher } from './ipc/publisher.js';
import { createEnvSecretStore } from './secrets.js';
import { WindowManager } from './windows/windowManager.js';

export interface DesktopShell {
  readonly mode: RuntimeMode;
  readonly runtime: CoreRuntime;
  readonly windows: WindowManager;
  shutdown(): Promise<void>;
}

const systemClock: Clock = { now: () => Date.now() };

function createConnectorFactory(scheduler: Scheduler): (provider: string) => LiveConnector {
  return (provider) => {
    if (provider === 'mock') return new MockConnector({ scheduler });

    // Task 07 registers the EulerStream connector here.
    throw new Error(`connector provider "${provider}" is not available yet`);
  };
}

export async function bootstrapDesktopShell(): Promise<DesktopShell> {
  const mode = resolveRuntimeMode(process.env);
  const scheduler = createRealScheduler();

  await app.whenReady();

  const windows = new WindowManager({
    mode,
    ...(process.env.ELECTRON_RENDERER_URL === undefined
      ? {}
      : { controlDevUrl: process.env.ELECTRON_RENDERER_URL }),
    ...(process.env.DANCE_ARENA_CONTROL_DEV_URL === undefined
      ? {}
      : { controlDevUrl: process.env.DANCE_ARENA_CONTROL_DEV_URL }),
    ...(process.env.DANCE_ARENA_STAGE_DEV_URL === undefined
      ? {}
      : { stageDevUrl: process.env.DANCE_ARENA_STAGE_DEV_URL }),
    controlBundle: join(__dirname, '../renderer/control/index.html'),
    stageBundle: join(__dirname, '../renderer/stage/index.html'),
    preloadDir: join(__dirname, '../preload'),
  });

  const runtime = createCoreRuntime({
    clock: systemClock,
    scheduler,
    ids: createSequentialIdGenerator(),
    createConnector: createConnectorFactory(scheduler),
    stageWindow: windows,
    secrets: createEnvSecretStore(),
    defaultProvider: 'mock',
  });

  runtime.setSinks(
    createWindowPublisher({
      getControlWindow: () => windows.getControlWindow(),
      getStageWindow: () => windows.getStageWindow(),
    }),
  );

  const router = new IpcRouter({
    runtime,
    isControlSender: (sender) => sender === windows.getControlWindow()?.webContents,
    isStageSender: (sender) => sender === windows.getStageWindow()?.webContents,
    onError: (channel, error) => {
      // Structured logging service arrives in Task 13; console.error is the sanctioned sink here.
      console.error(`[ipc] ${channel} failed:`, error instanceof Error ? error.message : error);
    },
  });

  router.register();
  runtime.start();

  windows.openControl();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.openControl();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  const shutdown = async (): Promise<void> => {
    router.dispose();
    await runtime.dispose();
    windows.closeAll();
  };

  app.on('before-quit', () => {
    void shutdown();
  });

  return { mode, runtime, windows, shutdown };
}

void bootstrapDesktopShell();
