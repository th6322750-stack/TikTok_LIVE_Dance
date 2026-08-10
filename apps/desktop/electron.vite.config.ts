import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/**
 * Electron Main + preload build.
 *
 * The CONTROL and STAGE renderers are separate Vite apps (`apps/control`, `apps/stage`) and are
 * therefore not declared as electron-vite renderers here. Task 04 wires the shell to their dev
 * servers / built output.
 *
 * Workspace packages are consumed from TypeScript source, so they must NOT be externalized.
 */
const WORKSPACE_DEPS = ['@dance-arena/contracts'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_DEPS })],
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: 'src/main/index.ts' } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_DEPS })],
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: 'src/preload/index.ts' } },
    },
  },
});
