import { defineConfig } from 'vite';

/**
 * STAGE renderer build.
 *
 * `base: './'` keeps the built bundle loadable from `file://` inside the Electron STAGE window
 * (Task 04/06).
 */
export default defineConfig({
  base: './',
  server: { port: 5274, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
