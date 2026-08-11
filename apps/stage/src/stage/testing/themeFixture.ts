/**
 * Builds the REAL resolved theme from the locked DA-VISUAL-R1 package for STAGE tests.
 *
 * STAGE is tested against the approved artwork the System Architect shipped, so a renamed or
 * removed asset id fails these tests instead of silently degrading at runtime.
 */

/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAssetRegistry,
  NEON_KAWAII_ARENA_THEME,
  parseAtlasMeta,
  parseProductionManifest,
  resolveTheme,
  type AssetRegistry,
  type AtlasMeta,
  type ResolvedTheme,
} from '@dance-arena/assets';

/** apps/stage/src/stage/testing → repository root. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const PRODUCTION_ROOT = 'assets/production/DA-VISUAL-R1';

export function loadLockedTheme(): { theme: ResolvedTheme; registry: AssetRegistry } {
  const manifestJson: unknown = JSON.parse(
    readFileSync(join(REPO_ROOT, PRODUCTION_ROOT, 'ASSET_MANIFEST.json'), 'utf8'),
  );
  const manifest = parseProductionManifest(manifestJson);
  if (!manifest.ok) throw new Error(`locked manifest invalid: ${manifest.errors.join('; ')}`);

  const atlases: Record<string, AtlasMeta> = {};
  for (const name of Object.keys(manifest.value.atlas)) {
    const parsed = parseAtlasMeta(
      JSON.parse(readFileSync(join(REPO_ROOT, PRODUCTION_ROOT, 'runtime', `${name}.json`), 'utf8')),
    );
    if (parsed.ok) atlases[name] = parsed.value;
  }

  const registry = createAssetRegistry({
    manifest: manifest.value,
    atlases,
    fallbacks: {
      body: 'dancer-regular-01',
      'vip-body': 'dancer-vip-female-01',
      'avatar-fallback': 'avatar-default-happy',
      effect: 'fx-tier1-spark',
    },
  });

  return { theme: resolveTheme(NEON_KAWAII_ARENA_THEME, registry), registry };
}
