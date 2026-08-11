/**
 * Loads the REAL locked manifest from the repository for tests.
 *
 * Testing against the actual approved DA-VISUAL-R1 package (not a hand-written fixture) is what
 * proves the implementation consumes the artwork the System Architect shipped. If ChatGPT lands a
 * new revision with different ids, these tests fail loudly instead of passing against a stale fake.
 */

/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAtlasMeta, parseProductionManifest } from '../manifest/schema.js';
import type { AtlasMeta, ProductionManifest } from '../manifest/schema.js';

/** packages/assets/src/testing → repository root. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export const PRODUCTION_ROOT = 'assets/production/DA-VISUAL-R1';

export function repoPath(...segments: string[]): string {
  return join(REPO_ROOT, ...segments);
}

export function loadLockedManifest(): ProductionManifest {
  const raw: unknown = JSON.parse(
    readFileSync(repoPath(PRODUCTION_ROOT, 'ASSET_MANIFEST.json'), 'utf8'),
  );
  const parsed = parseProductionManifest(raw);

  if (!parsed.ok) throw new Error(`locked manifest is invalid: ${parsed.errors.join('; ')}`);

  return parsed.value;
}

export function loadLockedAtlases(manifest: ProductionManifest): Record<string, AtlasMeta> {
  const atlases: Record<string, AtlasMeta> = {};

  for (const name of Object.keys(manifest.atlas)) {
    const raw: unknown = JSON.parse(
      readFileSync(repoPath(PRODUCTION_ROOT, 'runtime', `${name}.json`), 'utf8'),
    );
    const parsed = parseAtlasMeta(raw);

    if (!parsed.ok) throw new Error(`atlas ${name} is invalid: ${parsed.errors.join('; ')}`);

    atlases[name] = parsed.value;
  }

  return atlases;
}

/** True when a tracked runtime file exists on disk (PNG sources are intentionally untracked). */
export function runtimeFileExists(relative: string): boolean {
  try {
    readFileSync(repoPath(relative));
    return true;
  } catch {
    return false;
  }
}
