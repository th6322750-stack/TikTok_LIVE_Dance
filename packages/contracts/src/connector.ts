/**
 * Connector layer contract (Blueprint §6–§8).
 *
 * A connector connects to a live source and emits RAW events plus status transitions. It must not
 * contain ranking, VIP, queue, party goal, dancer or any other gameplay logic.
 */

import { z } from 'zod';

import { NonEmptyStringSchema, NonNegativeIntSchema, TimestampSchema } from './common.js';
import type { Unsubscribe } from './common.js';
import type { RawLiveEvent } from './live/raw.js';
import { LIVE_PROVIDERS } from './live/raw.js';

/** Connection state machine (Blueprint §7). A boolean is explicitly NOT enough. */
export const CONNECTOR_STATUSES = [
  'idle',
  'connecting',
  'connected',
  'reconnecting',
  'disconnecting',
  'error',
] as const;

export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const ConnectorStatusSchema = z.enum(CONNECTOR_STATUSES);

/**
 * Room statistics reported by the provider.
 *
 * Deliberately NOT a normalized live event: Blueprint §9 fixes the event union at six gameplay
 * event types, and viewer count is presentation metadata, not gameplay input. It therefore rides
 * on the connector status channel.
 */
export const RoomStatsSchema = z.object({
  viewerCount: NonNegativeIntSchema.optional(),
  totalLikeCount: NonNegativeIntSchema.optional(),
});

export type RoomStats = z.infer<typeof RoomStatsSchema>;

export const ConnectorStatusEventSchema = z.object({
  provider: z.enum(LIVE_PROVIDERS),
  status: ConnectorStatusSchema,
  at: TimestampSchema,
  /** Target room/account handle. Never a secret. */
  target: z.string().optional(),
  /** Redacted, human readable reason for `error` / `reconnecting`. Never contains credentials. */
  reason: z.string().optional(),
  /** Reconnect attempt number while `status === 'reconnecting'`. */
  attempt: NonNegativeIntSchema.optional(),
  /** Delay before the next reconnect attempt, in ms. */
  nextRetryInMs: NonNegativeIntSchema.optional(),
  room: RoomStatsSchema.optional(),
});

export type ConnectorStatusEvent = z.infer<typeof ConnectorStatusEventSchema>;

/**
 * Connector configuration.
 *
 * SECURITY: credentials never live in this object once it crosses a process boundary. CONTROL
 * sends `{ target }` and Main injects the API key from secret storage (Blueprint §45).
 */
export const ConnectorConfigSchema = z.object({
  /** TikTok @handle / room to attach to. */
  target: NonEmptyStringSchema,
  /** Provider API key. Main-process only — never sent to a renderer, never logged. */
  apiKey: z.string().optional(),
  /** Override the provider endpoint (tests, self-hosted gateways). */
  endpoint: z.string().optional(),
});

export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

/** The connector interface every implementation must satisfy (Blueprint §6). */
export interface LiveConnector {
  readonly provider: string;
  connect(config: ConnectorConfig): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(callback: (event: RawLiveEvent) => void): Unsubscribe;
  onStatus(callback: (status: ConnectorStatusEvent) => void): Unsubscribe;
  getStatus(): ConnectorStatus;
}

/**
 * Reconnect backoff schedule in ms (Blueprint §8): 1s → 2s → 4s → 8s → 15s → 30s, then held at
 * 30s. Jitter is applied by the connector.
 */
export const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000] as const;

/** ±20% jitter (Blueprint §8) so many clients never reconnect in lockstep. */
export const RECONNECT_JITTER_RATIO = 0.2;
