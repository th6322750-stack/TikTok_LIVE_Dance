/**
 * Events emitted by the Core Engine (Blueprint §40, §41).
 *
 * The engine emits ONE flat stream. Every member carries a namespaced `type`, so the composition
 * root routes by prefix — `stage:*` to the STAGE window, `game:*` to CONTROL — without knowing
 * anything about gameplay.
 */

import { z } from 'zod';

import { AutoHostTriggerSchema } from '../auto-host.js';
import { NonEmptyStringSchema, NonNegativeIntSchema, TimestampSchema } from '../common.js';
import { LIVE_EVENT_TYPES } from '../live/events.js';
import { StageEventSchema } from '../stage/events.js';
import { COMMAND_REJECTIONS, GAME_COMMANDS } from './commands.js';
import {
  GameSnapshotSchema,
  QueueEntrySchema,
  RankingStateSchema,
  SessionStatsSchema,
  UserStateSchema,
} from './state.js';

/** One line of the CONTROL live event feed (Blueprint §37). Dev-facing, never gameplay input. */
export const EventLogEntrySchema = z.object({
  id: NonEmptyStringSchema,
  at: TimestampSchema,
  level: z.enum(['info', 'warn', 'error']),
  /** Short machine-readable label, e.g. `gift`, `command`, `command-rejected`. */
  kind: NonEmptyStringSchema,
  message: z.string(),
  userId: z.string().optional(),
  nickname: z.string().optional(),
});

export type EventLogEntry = z.infer<typeof EventLogEntrySchema>;

export const ControlEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('game:snapshot'),
    snapshot: GameSnapshotSchema,
  }),
  z.object({
    type: z.literal('game:queue-updated'),
    at: TimestampSchema,
    queue: z.array(QueueEntrySchema),
  }),
  z.object({
    type: z.literal('game:ranking-updated'),
    at: TimestampSchema,
    ranking: RankingStateSchema,
  }),
  z.object({
    type: z.literal('game:session-stats'),
    at: TimestampSchema,
    stats: SessionStatsSchema,
  }),
  z.object({
    type: z.literal('game:user-updated'),
    at: TimestampSchema,
    user: UserStateSchema,
  }),
  z.object({
    type: z.literal('game:event-log'),
    entry: EventLogEntrySchema,
  }),
  z.object({
    type: z.literal('game:command-accepted'),
    at: TimestampSchema,
    command: z.enum(GAME_COMMANDS),
    userId: NonEmptyStringSchema,
  }),
  z.object({
    type: z.literal('game:command-rejected'),
    at: TimestampSchema,
    command: z.enum(GAME_COMMANDS),
    userId: NonEmptyStringSchema,
    reason: z.enum(COMMAND_REJECTIONS),
  }),
  z.object({
    type: z.literal('game:live-event'),
    at: TimestampSchema,
    eventType: z.enum(LIVE_EVENT_TYPES),
    userId: NonEmptyStringSchema,
    nickname: z.string(),
    diamonds: NonNegativeIntSchema.optional(),
  }),
]);

export type ControlEvent = z.infer<typeof ControlEventSchema>;

export type ControlEventType = ControlEvent['type'];

export type ControlEventOf<T extends ControlEventType> = Extract<ControlEvent, { type: T }>;

/**
 * Auto Host trigger emitted from a REAL Core transition (Task 10 §3.1).
 *
 * This namespace never crosses an IPC boundary: the composition root routes `host:*` to the
 * Auto Host rule engine, exactly as it routes `stage:*` to STAGE and `game:*` to CONTROL. Keeping
 * it in the same flat stream is what guarantees a rank promotion or a completed party goal can
 * only be observed at the moment the engine actually performed it.
 */
export const HostTriggerEventSchema = z.object({
  type: z.literal('host:trigger'),
  trigger: AutoHostTriggerSchema,
});

export type HostTriggerEvent = z.infer<typeof HostTriggerEventSchema>;

/** Everything the engine can emit. */
export const EngineEventSchema = z.union([
  ControlEventSchema,
  StageEventSchema,
  HostTriggerEventSchema,
]);

export type EngineEvent = z.infer<typeof EngineEventSchema>;

export function isStageEvent(
  event: EngineEvent,
): event is Extract<EngineEvent, { type: `stage:${string}` }> {
  return event.type.startsWith('stage:');
}

export function isControlEvent(event: EngineEvent): event is ControlEvent {
  return event.type.startsWith('game:');
}

export function isHostTriggerEvent(event: EngineEvent): event is HostTriggerEvent {
  return event.type === 'host:trigger';
}
