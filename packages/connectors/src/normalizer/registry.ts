/**
 * Normalizer registry.
 *
 * Routes a raw event to the adapter of its provider, so the composition root wires ONE normalize
 * function regardless of which connector is active (Blueprint §9/§76).
 */

import type { RawLiveEvent } from '@dance-arena/contracts';

import { MockNormalizer } from './mock.js';
import { ignored, type EventNormalizer, type NormalizeResult } from './types.js';

export interface NormalizerRegistry {
  normalize(raw: RawLiveEvent): NormalizeResult;
  register(normalizer: EventNormalizer, providers: readonly string[]): void;
}

export function createNormalizerRegistry(
  normalizers: readonly EventNormalizer[] = [new MockNormalizer()],
): NormalizerRegistry {
  const byProvider = new Map<string, EventNormalizer>();

  const register = (normalizer: EventNormalizer, providers: readonly string[]): void => {
    for (const provider of providers) byProvider.set(provider, normalizer);
  };

  for (const normalizer of normalizers) {
    // The mock adapter also serves 'replay', which replays previously recorded mock payloads.
    register(
      normalizer,
      normalizer.provider === 'mock' ? ['mock', 'replay'] : [normalizer.provider],
    );
  }

  return {
    register,
    normalize(raw: RawLiveEvent): NormalizeResult {
      const normalizer = byProvider.get(raw.provider);
      if (normalizer === undefined) return ignored(`no normalizer for provider ${raw.provider}`);

      return normalizer.normalize(raw);
    },
  };
}
