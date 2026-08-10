import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Dance Arena V2 lint configuration.
 *
 * Beyond normal code quality this config acts as an *architecture fitness function*: the
 * dependency rules of `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` (§67 Dependency Direction,
 * §42 IPC Security) are enforced as lint errors so a boundary violation fails CI instead of being
 * discovered during review.
 *
 * `scripts/check-dependency-direction.mjs` enforces the same rules at the package.json level.
 */

const NODE_BUILTINS = [
  'node:*',
  'fs',
  'fs/*',
  'path',
  'os',
  'child_process',
  'process',
  'crypto',
  'net',
  'http',
  'https',
  'worker_threads',
];

const ELECTRON = ['electron', 'electron/*'];
const REACT = ['react', 'react/*', 'react-dom', 'react-dom/*'];
const PIXI = ['pixi.js', 'pixi.js/*', '@pixi/*'];
const APPS = ['@dance-arena/desktop', '@dance-arena/control', '@dance-arena/stage'];

/** @param {{ group: string[], message: string }[]} patterns */
const restrictImports = (patterns) => ['error', { patterns }];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
    ],
  },

  // ── Base ────────────────────────────────────────────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSUnknownKeyword',
          message:
            'Do not launder types through `as unknown as T`. Validate external data at the boundary (Zod) instead.',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ── Renderer-facing app code (browser globals) ──────────────────────────────────────────────
  {
    files: ['apps/{control,stage}/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // ── packages/**: platform-neutral domain code ───────────────────────────────────────────────
  // Blueprint §67: core-engine (and every other package) must never import Electron/React/PixiJS.
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: ELECTRON,
          message:
            'packages/** must stay platform-neutral. Electron belongs in apps/desktop (Blueprint §67).',
        },
        {
          group: REACT,
          message: 'packages/** must not import React. Presentation belongs in apps/control.',
        },
        {
          group: PIXI,
          message: 'packages/** must not import PixiJS. Rendering belongs in apps/stage.',
        },
        {
          group: APPS,
          message: 'Dependency direction is packages → apps, never the reverse (Blueprint §67).',
        },
      ]),
    },
  },

  // contracts + core-engine are the pure domain layer: no I/O, no platform APIs.
  {
    files: ['packages/{contracts,core-engine}/src/**/*.ts'],
    ignores: ['packages/*/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: [...ELECTRON, ...REACT, ...PIXI, ...APPS],
          message: 'Forbidden dependency for the pure domain layer (Blueprint §14, §67).',
        },
        {
          group: NODE_BUILTINS,
          message:
            'contracts/core-engine must be deterministic and platform-neutral: no Node built-ins. Do I/O in a platform package (settings, logging, connectors) instead.',
        },
      ]),
    },
  },

  // ── apps/desktop: Electron Main + preload — no gameplay, no presentation libs ────────────────
  {
    files: ['apps/desktop/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: [...REACT, ...PIXI],
          message:
            'Electron Main/preload must not import renderer libraries (Blueprint §4). Keep presentation in apps/control and apps/stage.',
        },
      ]),
    },
  },

  // ── Renderers: no direct Node/Electron access (Blueprint §42) ───────────────────────────────
  {
    files: ['apps/{control,stage}/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: [...ELECTRON, ...NODE_BUILTINS],
          message:
            'Renderers must not touch Node/Electron APIs directly. Use the preload whitelist exposed on window (Blueprint §42).',
        },
      ]),
    },
  },
  {
    files: ['apps/control/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: PIXI,
          message: 'CONTROL is React-only. PixiJS belongs to apps/stage (Blueprint §35).',
        },
      ]),
    },
  },
  {
    files: ['apps/stage/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: REACT,
          message: 'STAGE is PixiJS-only. React belongs to apps/control (Blueprint §28).',
        },
      ]),
    },
  },

  // ── Exceptions ──────────────────────────────────────────────────────────────────────────────
  {
    // The logging package is the one place allowed to talk to a console sink.
    files: ['packages/logging/src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['*.config.{ts,mts,mjs}', 'apps/*/*.config.{ts,mts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  prettier,
);
