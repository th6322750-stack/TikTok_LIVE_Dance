/**
 * Avatar texture cache with fallback (Blueprint §31, §34).
 *
 * Pipeline: remote image → cache → texture → circle mask. A failed load must never leave a hole
 * in the scene, so every failure resolves to a generated default avatar instead of throwing.
 */

import { Assets, Texture } from 'pixi.js';

const memory = new Map<string, Promise<Texture>>();

let fallback: Texture | undefined;

/** Deterministic placeholder avatar (Task 09 replaces it with the production asset). */
export function fallbackAvatarTexture(): Texture {
  fallback ??= Texture.WHITE;
  return fallback;
}

export async function loadAvatarTexture(url: string | undefined): Promise<Texture> {
  if (url === undefined || url.length === 0) return fallbackAvatarTexture();

  const cached = memory.get(url);
  if (cached !== undefined) return cached;

  const pending = Assets.load<Texture>(url).catch(() => fallbackAvatarTexture());
  memory.set(url, pending);

  return pending;
}

export function clearAvatarCache(): void {
  memory.clear();
}
