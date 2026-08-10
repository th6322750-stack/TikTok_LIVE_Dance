import { defineConfig } from 'vitest/config';

/**
 * Single test runner for the whole workspace (Task 00 gate: "test runner thống nhất").
 *
 * Tests live next to the code they cover (`*.test.ts` / `*.test.tsx`). Workspace packages are
 * resolved from source through their package.json `exports`, so no build step is required
 * before running tests.
 */
export default defineConfig({
  test: {
    include: ['{packages,apps}/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**'],
    environment: 'node',
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['{packages,apps}/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}'],
    },
  },
});
