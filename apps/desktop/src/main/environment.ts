/**
 * Runtime mode detection for the Electron Main process.
 *
 * Kept as a pure function so it is testable without booting Electron.
 */

export type RuntimeMode = 'development' | 'production';

/** Environment variable set by `electron-vite dev` when a renderer dev server is running. */
const RENDERER_DEV_SERVER_ENV = 'ELECTRON_RENDERER_URL';

/**
 * Resolves the runtime mode from an environment snapshot.
 *
 * Anything that is not explicitly a development signal resolves to `production`, so a malformed or
 * missing `NODE_ENV` can never accidentally unlock development behaviour in a shipped build.
 */
export function resolveRuntimeMode(env: Readonly<Record<string, string | undefined>>): RuntimeMode {
  if (env.NODE_ENV === 'development') return 'development';
  if (typeof env[RENDERER_DEV_SERVER_ENV] === 'string' && env[RENDERER_DEV_SERVER_ENV] !== '') {
    return 'development';
  }
  return 'production';
}
