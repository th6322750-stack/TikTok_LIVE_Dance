/**
 * Normalizer boundary (Blueprint §9, §76).
 *
 * This is the ONLY place a provider payload is interpreted. Everything downstream — engine,
 * CONTROL, STAGE — sees normalized contracts and nothing else. When a provider changes its
 * schema, only an adapter here changes.
 */

import type { LiveEvent, RawLiveEvent } from '@dance-arena/contracts';

export type NormalizeResult =
  | { readonly ok: true; readonly event: LiveEvent }
  /**
   * Not an error path for the connector: heartbeats, room stats and unknown message kinds are
   * expected and must be dropped quietly rather than crashing the pipeline.
   */
  | { readonly ok: false; readonly reason: 'ignored' | 'invalid'; readonly detail?: string };

export interface EventNormalizer {
  readonly provider: string;
  normalize(raw: RawLiveEvent): NormalizeResult;
}

export const ignored = (detail?: string): NormalizeResult => ({
  ok: false,
  reason: 'ignored',
  ...(detail === undefined ? {} : { detail }),
});

export const invalid = (detail: string): NormalizeResult => ({
  ok: false,
  reason: 'invalid',
  detail,
});
