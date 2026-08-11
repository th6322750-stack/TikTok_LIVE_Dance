/**
 * Typed IPC contracts (Blueprint §38–§42).
 *
 * Every channel is namespaced (`app:`, `connector:`, `game:`, `stage:`, `settings:`, `license:`,
 * `diagnostics:`, `simulator:`) — no generic `message` / `do-stuff` channels.
 *
 * The request schema map below is the SINGLE source for both compile-time types and runtime
 * validation, so a channel can never be typed one way and validated another. Main validates every
 * inbound renderer payload with these schemas before the Core Engine sees it.
 */

import { z } from 'zod';

import { NonEmptyStringSchema, NonNegativeIntSchema } from '../common.js';
import type { CommandResult } from '../common.js';
import { ConnectorStatusEventSchema } from '../connector.js';
import { ControlCommandSchema } from '../game/commands.js';
import { ControlEventSchema, EventLogEntrySchema } from '../game/events.js';
import { GameSnapshotSchema, SessionStatsSchema } from '../game/state.js';
import { LiveEventSchema } from '../live/events.js';
import { StageEventSchema, StageSnapshotSchema } from '../stage/events.js';

const EmptyRequestSchema = z.object({}).strict();

// ── Stage window control (Blueprint §5) ───────────────────────────────────────────────────────

export const StageBoundsSchema = z.object({
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type StageBounds = z.infer<typeof StageBoundsSchema>;

export const STAGE_PRESETS = ['720x1280', '1080x1920'] as const;

export type StagePreset = (typeof STAGE_PRESETS)[number];

export const StageLayoutRequestSchema = z.object({
  preset: z.enum(STAGE_PRESETS).optional(),
  bounds: StageBoundsSchema.optional(),
  alwaysOnTop: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
  transparent: z.boolean().optional(),
});

export type StageLayoutRequest = z.infer<typeof StageLayoutRequestSchema>;

export const StageWindowStateSchema = z.object({
  open: z.boolean(),
  alwaysOnTop: z.boolean(),
  bounds: StageBoundsSchema.optional(),
});

export type StageWindowState = z.infer<typeof StageWindowStateSchema>;

// ── Simulator (Blueprint §53) ─────────────────────────────────────────────────────────────────

export const SimulatorScenarioRequestSchema = z.object({
  scenarioId: NonEmptyStringSchema,
  /** Playback speed multiplier: 1x / 2x / 5x (Blueprint §54). */
  speed: z.number().positive().optional(),
});

export type SimulatorScenarioRequest = z.infer<typeof SimulatorScenarioRequestSchema>;

export const SimulatorEmitRequestSchema = z.object({
  /** Which synthetic event to inject; it still travels the full pipeline (Blueprint §53). */
  preset: z.enum(['comment-go', 'comment-move', 'gift', 'follow', 'share', 'join', 'like']),
  userId: z.string().optional(),
  nickname: z.string().optional(),
  comment: z.string().optional(),
  diamonds: NonNegativeIntSchema.optional(),
  repeatCount: NonNegativeIntSchema.optional(),
  streak: z.boolean().optional(),
  streakEnded: z.boolean().optional(),
});

export type SimulatorEmitRequest = z.infer<typeof SimulatorEmitRequestSchema>;

// ── Connect request ───────────────────────────────────────────────────────────────────────────

/**
 * CONTROL asks Main to connect. Note the absence of `apiKey`: the renderer must never hold or
 * forward the provider secret (Blueprint §45). Main injects it from secret storage.
 */
export const ConnectorConnectRequestSchema = z.object({
  target: NonEmptyStringSchema,
  provider: z.enum(['eulerstream', 'mock']).optional(),
});

export type ConnectorConnectRequest = z.infer<typeof ConnectorConnectRequestSchema>;

// ── Initial handshake payloads ────────────────────────────────────────────────────────────────

export const ControlInitialStateSchema = z.object({
  snapshot: GameSnapshotSchema,
  connector: ConnectorStatusEventSchema,
  stats: SessionStatsSchema,
  stage: StageWindowStateSchema,
  recentEvents: z.array(EventLogEntrySchema),
  /** True when a provider API key is configured. The key itself is never sent (Blueprint §45). */
  apiKeyConfigured: z.boolean(),
});

export type ControlInitialState = z.infer<typeof ControlInitialStateSchema>;

// ── CONTROL → Main (invoke) ───────────────────────────────────────────────────────────────────

export const controlInvokeSchemas = {
  'control:ready': EmptyRequestSchema,
  'connector:connect': ConnectorConnectRequestSchema,
  'connector:disconnect': EmptyRequestSchema,
  'game:command': ControlCommandSchema,
  'stage:open': EmptyRequestSchema,
  'stage:close': EmptyRequestSchema,
  'stage:reload': EmptyRequestSchema,
  'stage:set-layout': StageLayoutRequestSchema,
  'simulator:emit-event': SimulatorEmitRequestSchema,
  'simulator:start-scenario': SimulatorScenarioRequestSchema,
  'simulator:stop': EmptyRequestSchema,
} as const;

export type ControlInvokeChannel = keyof typeof controlInvokeSchemas;

export type ControlInvokeRequest<C extends ControlInvokeChannel> = z.infer<
  (typeof controlInvokeSchemas)[C]
>;

export interface ControlInvokeResponseMap {
  'control:ready': ControlInitialState;
  'connector:connect': CommandResult;
  'connector:disconnect': CommandResult;
  'game:command': CommandResult;
  'stage:open': StageWindowState;
  'stage:close': StageWindowState;
  'stage:reload': StageWindowState;
  'stage:set-layout': StageWindowState;
  'simulator:emit-event': CommandResult;
  'simulator:start-scenario': CommandResult;
  'simulator:stop': CommandResult;
}

export type ControlInvokeResponse<C extends ControlInvokeChannel> = ControlInvokeResponseMap[C];

export const CONTROL_INVOKE_CHANNELS = Object.keys(controlInvokeSchemas) as ControlInvokeChannel[];

// ── STAGE → Main (invoke) ─────────────────────────────────────────────────────────────────────

export const stageInvokeSchemas = {
  /** Sent after every STAGE load/reload; Main answers with a fresh snapshot (Blueprint §60). */
  'stage:ready': EmptyRequestSchema,
} as const;

export type StageInvokeChannel = keyof typeof stageInvokeSchemas;

export type StageInvokeRequest<C extends StageInvokeChannel> = z.infer<
  (typeof stageInvokeSchemas)[C]
>;

export interface StageInvokeResponseMap {
  'stage:ready': StageSnapshotEnvelope;
}

export type StageInvokeResponse<C extends StageInvokeChannel> = StageInvokeResponseMap[C];

export const STAGE_INVOKE_CHANNELS = Object.keys(stageInvokeSchemas) as StageInvokeChannel[];

export const StageSnapshotEnvelopeSchema = z.object({
  snapshot: StageSnapshotSchema,
});

export type StageSnapshotEnvelope = z.infer<typeof StageSnapshotEnvelopeSchema>;

// ── Main → CONTROL (push) ─────────────────────────────────────────────────────────────────────

export const controlPushSchemas = {
  'connector:status': ConnectorStatusEventSchema,
  'game:event': ControlEventSchema,
  'diagnostics:error': z.object({
    at: z.number(),
    scope: NonEmptyStringSchema,
    message: z.string(),
  }),
  'stage:window-state': StageWindowStateSchema,
} as const;

export type ControlPushChannel = keyof typeof controlPushSchemas;

export type ControlPushPayload<C extends ControlPushChannel> = z.infer<
  (typeof controlPushSchemas)[C]
>;

export const CONTROL_PUSH_CHANNELS = Object.keys(controlPushSchemas) as ControlPushChannel[];

// ── Main → STAGE (push) ───────────────────────────────────────────────────────────────────────

export const stagePushSchemas = {
  'stage:snapshot': StageSnapshotSchema,
  'stage:event': StageEventSchema,
} as const;

export type StagePushChannel = keyof typeof stagePushSchemas;

export type StagePushPayload<C extends StagePushChannel> = z.infer<(typeof stagePushSchemas)[C]>;

export const STAGE_PUSH_CHANNELS = Object.keys(stagePushSchemas) as StagePushChannel[];

// ── Simulator/normalizer boundary ─────────────────────────────────────────────────────────────

/** Re-exported so a boundary can validate a normalized event without importing the live module. */
export const NormalizedLiveEventSchema = LiveEventSchema;
