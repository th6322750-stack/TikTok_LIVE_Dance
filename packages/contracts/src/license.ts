/**
 * Licensing contracts (Blueprint §46–§48).
 *
 * Types only — Task 12 implements the service. Recorded here so the entitlement gate can be
 * referenced by Main from the start: `CONNECT_LIVE` is gated by entitlement, not by UI state.
 */

import { z } from 'zod';

import { NonEmptyStringSchema, TimestampSchema } from './common.js';

export const LICENSE_STATES = ['trial', 'active', 'expired', 'invalid', 'grace-period'] as const;

export type LicenseState = (typeof LICENSE_STATES)[number];

export const LicenseStateSchema = z.enum(LICENSE_STATES);

export const ENTITLEMENTS = ['connect-live', 'open-stage', 'auto-host', 'dj-audio'] as const;

export type Entitlement = (typeof ENTITLEMENTS)[number];

export const LicenseSnapshotSchema = z.object({
  state: LicenseStateSchema,
  entitlements: z.array(z.enum(ENTITLEMENTS)),
  expiresAt: TimestampSchema.optional(),
  /** Opaque machine fingerprint. Never a raw hardware id in logs or diagnostics. */
  machineId: NonEmptyStringSchema.optional(),
});

export type LicenseSnapshot = z.infer<typeof LicenseSnapshotSchema>;
