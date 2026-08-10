/**
 * Electron Main entry point — Task 00 skeleton.
 *
 * Blueprint §4/§59: Main owns lifecycle, windows, IPC and service wiring. It never contains
 * gameplay logic. This skeleton only proves the shell boots and the workspace contracts resolve.
 *
 * Deliberately NOT here yet (Task 04): WindowManager, IpcRouter, ConnectorManager, CoreRuntime,
 * Settings/License/Asset/Logging services. No BrowserWindow is created at this stage, so the app
 * boots headless.
 */

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';
import { app, type App } from 'electron';

import { resolveRuntimeMode, type RuntimeMode } from './environment.js';

export interface DesktopShellInfo {
  readonly mode: RuntimeMode;
  readonly contractsSchemaVersion: typeof CONTRACTS_SCHEMA_VERSION;
}

/**
 * Boots the Electron shell.
 *
 * @param electronApp injectable for tests; defaults to the real Electron app instance.
 */
export async function bootstrapDesktopShell(electronApp: App = app): Promise<DesktopShellInfo> {
  const mode = resolveRuntimeMode(process.env);

  electronApp.on('window-all-closed', () => {
    // Windows arrive in Task 04; keep the standard non-macOS quit behaviour in place already.
    if (process.platform !== 'darwin') electronApp.quit();
  });

  await electronApp.whenReady();

  return { mode, contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION };
}

void bootstrapDesktopShell();
