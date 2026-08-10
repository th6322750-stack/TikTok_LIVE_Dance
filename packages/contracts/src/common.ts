/**
 * Primitives shared by every contract in the system.
 *
 * Blueprint §9: every internal contract carries `version: 1` so a future schema change can be
 * migrated instead of silently misinterpreted.
 */

import { z } from 'zod';

/** Version of the internal Dance Arena event/state contracts. */
export const CONTRACTS_SCHEMA_VERSION = 1 as const;

export const ContractsVersionSchema = z.literal(CONTRACTS_SCHEMA_VERSION);

/** Epoch milliseconds. */
export type Timestamp = number;

export const TimestampSchema = z.number().int().nonnegative();

/**
 * Boundary strings are kept permissive on purpose: a provider sending an odd-but-usable value
 * must not crash the pipeline. Strictness belongs to the fields that carry meaning (ids, counts).
 */
export const NonEmptyStringSchema = z.string().min(1);

export const NonNegativeIntSchema = z.number().int().nonnegative();

export const PositiveIntSchema = z.number().int().positive();

/** Normalized 0.0 → 1.0 coordinate (Blueprint §22) so layouts scale across 720p/1080p/1440p. */
export const NormalizedUnitSchema = z.number().min(0).max(1);

export const NormalizedPositionSchema = z.object({
  x: NormalizedUnitSchema,
  y: NormalizedUnitSchema,
});

export type NormalizedPosition = z.infer<typeof NormalizedPositionSchema>;

/** Recursively readonly view of a value. Used for state a consumer must not mutate. */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Unsubscribe handle returned by every `on*` subscription in the system (Blueprint §6). */
export type Unsubscribe = () => void;

/** Result of a command that may be rejected by the Core Engine. */
export interface CommandResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export const CommandResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
});
