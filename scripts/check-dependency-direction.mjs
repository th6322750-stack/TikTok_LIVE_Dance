#!/usr/bin/env node
/**
 * Architecture guard — package.json level.
 *
 * Enforces the dependency rules from `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`:
 *   §14  Core Engine is a pure TypeScript package (no Electron / React / PixiJS).
 *   §67  Allowed direction: contracts ← packages ← apps. Never apps ← packages.
 *   §35  CONTROL is the React app; §28 STAGE is the PixiJS app. They do not share UI runtimes.
 *
 * `eslint.config.mjs` enforces the same boundaries at import level; this script catches the case
 * where a forbidden dependency is merely *declared* (or a workspace edge points the wrong way).
 *
 * Usage: node scripts/check-dependency-direction.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = '@dance-arena/';

/** Dependencies that must never appear in `packages/**`. */
const PLATFORM_ONLY_DEPS = [
  'electron',
  'electron-vite',
  'electron-builder',
  'react',
  'react-dom',
  'pixi.js',
];

/** Extra per-app restrictions: an app must not pull in the other renderer's runtime. */
const APP_FORBIDDEN_DEPS = {
  '@dance-arena/control': ['pixi.js', '@pixi/'],
  '@dance-arena/stage': ['react', 'react-dom'],
  '@dance-arena/desktop': ['react', 'react-dom', 'pixi.js', '@pixi/'],
};

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * @typedef {object} WorkspacePackage
 * @property {string} name
 * @property {'app' | 'package'} kind
 * @property {string} dir           absolute directory
 * @property {string} relDir        repo-relative directory
 * @property {Record<string, unknown>} manifest
 */

/** @returns {WorkspacePackage[]} */
function readWorkspace() {
  /** @type {WorkspacePackage[]} */
  const found = [];

  for (const [group, kind] of [
    ['apps', /** @type {const} */ ('app')],
    ['packages', /** @type {const} */ ('package')],
  ]) {
    const groupDir = join(ROOT, group);
    if (!existsSync(groupDir)) continue;

    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(groupDir, entry.name);
      const manifestPath = join(dir, 'package.json');
      if (!existsSync(manifestPath)) continue;

      // Strip a UTF-8 BOM (U+FEFF): some Windows editors add one and JSON.parse rejects it.
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
      found.push({
        name: manifest.name,
        kind,
        dir,
        relDir: `${group}/${entry.name}`,
        manifest,
      });
    }
  }

  return found;
}

/**
 * @param {WorkspacePackage} pkg
 * @returns {Record<string, string>}
 */
function allDeps(pkg) {
  /** @type {Record<string, string>} */
  const deps = {};
  for (const field of DEP_FIELDS) {
    Object.assign(deps, pkg.manifest[field] ?? {});
  }
  return deps;
}

/**
 * @param {WorkspacePackage[]} workspace
 * @returns {string[]} human readable violations
 */
export function findViolations(workspace) {
  /** @type {string[]} */
  const violations = [];
  const byName = new Map(workspace.map((pkg) => [pkg.name, pkg]));
  const appNames = new Set(workspace.filter((pkg) => pkg.kind === 'app').map((pkg) => pkg.name));

  for (const pkg of workspace) {
    const deps = allDeps(pkg);

    // 1. Manifest hygiene — everything in this monorepo is private and scoped.
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith(SCOPE)) {
      violations.push(`${pkg.relDir}: package name must be scoped "${SCOPE}*" (got "${pkg.name}")`);
    }
    if (pkg.manifest.private !== true) {
      violations.push(`${pkg.relDir}: must set "private": true (nothing here is published to npm)`);
    }

    // 2. The source-first convention: exports must point at a file that exists.
    const exportTarget = pkg.manifest.exports?.['.'];
    const mainTarget = typeof exportTarget === 'string' ? exportTarget : pkg.manifest.main;
    if (pkg.kind === 'package') {
      if (typeof mainTarget !== 'string') {
        violations.push(`${pkg.relDir}: must declare an entry point via "exports" or "main"`);
      } else if (!existsSync(join(pkg.dir, mainTarget))) {
        violations.push(`${pkg.relDir}: entry point "${mainTarget}" does not exist`);
      }
    }

    for (const [dep, range] of Object.entries(deps)) {
      // 3. Internal edges must use the workspace protocol and point at a real package.
      if (dep.startsWith(SCOPE)) {
        if (!byName.has(dep)) {
          violations.push(`${pkg.relDir}: depends on unknown workspace package "${dep}"`);
        }
        if (!String(range).startsWith('workspace:')) {
          violations.push(
            `${pkg.relDir}: internal dependency "${dep}" must use the "workspace:*" protocol (got "${range}")`,
          );
        }
      }

      // 4. Dependency direction: packages must never depend on apps.
      if (pkg.kind === 'package' && appNames.has(dep)) {
        violations.push(
          `${pkg.relDir}: packages must not depend on the app "${dep}" — allowed direction is packages → apps (Blueprint §67)`,
        );
      }

      // 5. packages/** stays platform-neutral.
      if (pkg.kind === 'package') {
        if (PLATFORM_ONLY_DEPS.includes(dep) || dep.startsWith('@pixi/')) {
          violations.push(
            `${pkg.relDir}: forbidden dependency "${dep}" — packages/** must not depend on Electron/React/PixiJS (Blueprint §14, §67)`,
          );
        }
      }

      // 6. Per-app runtime separation.
      const forbiddenForApp = APP_FORBIDDEN_DEPS[pkg.name] ?? [];
      for (const forbidden of forbiddenForApp) {
        const hit = forbidden.endsWith('/') ? dep.startsWith(forbidden) : dep === forbidden;
        if (hit) {
          violations.push(`${pkg.relDir}: "${pkg.name}" must not depend on "${dep}"`);
        }
      }
    }
  }

  violations.push(...findCycles(workspace));
  return violations;
}

/**
 * Depth-first cycle detection over internal workspace edges.
 * @param {WorkspacePackage[]} workspace
 * @returns {string[]}
 */
function findCycles(workspace) {
  /** @type {Map<string, string[]>} */
  const graph = new Map(
    workspace.map((pkg) => [
      pkg.name,
      Object.keys(allDeps(pkg)).filter((dep) => dep.startsWith(SCOPE)),
    ]),
  );

  /** @type {string[]} */
  const cycles = [];
  /** @type {Set<string>} */
  const done = new Set();

  /**
   * @param {string} node
   * @param {string[]} path
   */
  const walk = (node, path) => {
    if (path.includes(node)) {
      cycles.push(`dependency cycle: ${[...path.slice(path.indexOf(node)), node].join(' → ')}`);
      return;
    }
    if (done.has(node)) return;
    for (const next of graph.get(node) ?? []) walk(next, [...path, node]);
    done.add(node);
  };

  for (const name of graph.keys()) walk(name, []);
  return cycles;
}

export function main() {
  const workspace = readWorkspace();

  if (workspace.length === 0) {
    console.error('✖ architecture check: no workspace packages found');
    process.exitCode = 1;
    return;
  }

  const violations = findViolations(workspace);

  if (violations.length > 0) {
    console.error(`✖ architecture check failed (${violations.length} violation(s)):\n`);
    for (const violation of violations) console.error(`  • ${violation}`);
    console.error(
      '\nSee docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md §67 (Dependency Direction).',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`✔ architecture check passed for ${workspace.length} workspace packages`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();

export { readWorkspace };
