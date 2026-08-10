/**
 * Raw provider event envelope (Blueprint §2.1).
 *
 * A connector emits RAW events. The payload is deliberately typed as `unknown`: it is untrusted
 * third-party data whose schema can change without notice, and TypeScript must force every reader
 * through validation before use. Only the normalizer is allowed to interpret it.
 */

import { z } from 'zod';

import { NonEmptyStringSchema, TimestampSchema } from '../common.js';

export const LIVE_PROVIDERS = ['eulerstream', 'mock', 'replay'] as const;

export type LiveProvider = (typeof LIVE_PROVIDERS)[number];

export const RawLiveEventSchema = z.object({
  provider: z.enum(LIVE_PROVIDERS),
  /** Provider-specific message kind, e.g. "chat", "gift", "WebcastGiftMessage". */
  kind: NonEmptyStringSchema,
  /** When the connector received the message. */
  receivedAt: TimestampSchema,
  /** Untrusted provider payload — must be validated before use. */
  payload: z.unknown(),
});

export type RawLiveEvent = z.infer<typeof RawLiveEventSchema>;
