/**
 * Synthetic MOCK-PROVIDER payload builders.
 *
 * These deliberately produce the mock provider's own shape, not normalized contracts: the
 * simulator must enter the pipeline at the same place a real provider does (Blueprint §53).
 */

import type { MockPayload } from '@dance-arena/connectors';

import type { SimulatedUser } from './users.js';

/** Gift presets required by Task 03 — one per Blueprint §26 tier. */
export const GIFT_PRESETS = [
  { id: 'rose', name: 'Rose', diamonds: 1 },
  { id: 'finger-heart', name: 'Finger Heart', diamonds: 25 },
  { id: 'perfume', name: 'Perfume', diamonds: 99 },
  { id: 'galaxy', name: 'Galaxy', diamonds: 500 },
  { id: 'universe', name: 'Universe', diamonds: 1500 },
] as const;

export type GiftPresetId = (typeof GIFT_PRESETS)[number]['id'];

export function giftPreset(diamonds: number): (typeof GIFT_PRESETS)[number] {
  return (
    [...GIFT_PRESETS].reverse().find((preset) => preset.diamonds <= diamonds) ?? GIFT_PRESETS[0]
  );
}

export function commentPayload(user: SimulatedUser, text: string, at: number): MockPayload {
  return { kind: 'comment', at, user, text };
}

export interface GiftPayloadOptions {
  readonly diamonds: number;
  readonly name?: string;
  readonly giftId?: string;
  readonly repeatCount?: number;
  readonly streak?: boolean;
  readonly streakEnded?: boolean;
  readonly transactionId?: string;
}

export function giftPayload(
  user: SimulatedUser,
  at: number,
  options: GiftPayloadOptions,
): MockPayload {
  const preset = giftPreset(options.diamonds);

  return {
    kind: 'gift',
    at,
    user,
    giftId: options.giftId ?? preset.id,
    giftName: options.name ?? preset.name,
    diamonds: options.diamonds,
    repeatCount: options.repeatCount ?? 1,
    streak: options.streak ?? false,
    streakEnded: options.streakEnded ?? true,
    ...(options.transactionId === undefined ? {} : { transactionId: options.transactionId }),
  };
}

/**
 * A full gift combo as the provider delivers it: x1, x2, x3 … each event carrying the CUMULATIVE
 * repeat count, with only the last one closing the streak.
 *
 * This is the exact shape that produces a 1+2+3+4 double-count bug if the engine sums naively.
 */
export function giftStreakPayloads(
  user: SimulatedUser,
  startAt: number,
  options: { diamonds: number; repeats: number; stepMs?: number; transactionId?: string },
): MockPayload[] {
  const stepMs = options.stepMs ?? 400;

  return Array.from({ length: options.repeats }, (_unused, index) => {
    const repeatCount = index + 1;
    return giftPayload(user, startAt + index * stepMs, {
      diamonds: options.diamonds,
      repeatCount,
      streak: repeatCount < options.repeats,
      streakEnded: repeatCount === options.repeats,
      ...(options.transactionId === undefined ? {} : { transactionId: options.transactionId }),
    });
  });
}

export function followPayload(user: SimulatedUser, at: number): MockPayload {
  return { kind: 'follow', at, user };
}

export function sharePayload(user: SimulatedUser, at: number): MockPayload {
  return { kind: 'share', at, user };
}

export function joinPayload(user: SimulatedUser, at: number): MockPayload {
  return { kind: 'join', at, user };
}

export function likePayload(user: SimulatedUser, at: number, likes = 1): MockPayload {
  return { kind: 'like', at, user, likes };
}
