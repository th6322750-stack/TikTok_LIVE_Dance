import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/**
 * Electron Main + preload build.
 *
 * The CONTROL and STAGE renderers are separate Vite apps (`apps/control`, `apps/stage`) and are
 * therefore not declared as electron-vite renderers here; Main loads their dev servers in
 * development and their built bundles in production.
 *
 * Each renderer gets its OWN preload bundle so the CONTROL whitelist is never reachable from the
 * STAGE window (Blueprint §42).
 *
 * Workspace packages are consumed from TypeScript source, so they must NOT be externalized.
 */
const WORKSPACE_DEPS = [
  '@dance-arena/contracts',
  '@dance-arena/core-engine',
  '@dance-arena/connectors',
  '@dance-arena/simulator',
];

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
      rollupOptions: {
        input: {
          control: 'src/preload/control.ts',
          stage: 'src/preload/stage.ts',
        },
      },
    },
  },
});
