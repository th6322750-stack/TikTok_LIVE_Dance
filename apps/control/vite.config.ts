import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * CONTROL renderer build.
 *
 * `base: './'` keeps the built bundle loadable from `file://` inside Electron (Task 04).
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5273, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
