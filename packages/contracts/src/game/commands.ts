/**
 * Commands (Blueprint §17–§18).
 *
 * Two distinct families, deliberately not merged:
 *  - `GameCommand`     — parsed from viewer chat ("GO", "VÀO", …).
 *  - `ControlCommand`  — operator intents sent from CONTROL through typed IPC.
 *
 * Both are validated and executed by the Core Engine; neither renderer may mutate state itself.
 */

import { z } from 'zod';

import { NonEmptyStringSchema, NonNegativeIntSchema } from '../common.js';
import type { Timestamp } from '../common.js';

// ── Chat commands ─────────────────────────────────────────────────────────────────────────────

export const GAME_COMMANDS = [
  'JOIN_STAGE',
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'MOVE_DOWN',
  'MOVE_VIP',
] as const;

export type GameCommand = (typeof GAME_COMMANDS)[number];

export const GameCommandSchema = z.enum(GAME_COMMANDS);

/** Cooldown class of a command — cooldowns are configured per class, never hard-coded (§18). */
export const COMMAND_KINDS = ['join', 'movement', 'vip'] as const;

export type CommandKind = (typeof COMMAND_KINDS)[number];

export const COMMAND_KIND_BY_COMMAND: Readonly<Record<GameCommand, CommandKind>> = {
  JOIN_STAGE: 'join',
  MOVE_LEFT: 'movement',
  MOVE_RIGHT: 'movement',
  MOVE_DOWN: 'movement',
  MOVE_VIP: 'vip',
};

/**
 * Default aliases, matched against `CommentEvent.normalizedComment` (already uppercased and
 * diacritic-stripped, so "vào"/"VÀO"/" Vao " all arrive as "VAO").
 */
export const DEFAULT_COMMAND_ALIASES: Readonly<Record<GameCommand, readonly string[]>> = {
  JOIN_STAGE: ['GO', 'JOIN', 'VAO', 'THAM GIA'],
  MOVE_LEFT: ['LEFT', 'TRAI', 'A'],
  MOVE_RIGHT: ['RIGHT', 'PHAI', 'D'],
  MOVE_DOWN: ['DOWN', 'XUONG', 'S'],
  MOVE_VIP: ['VIP', 'LEN VIP'],
};

/**
 * Aliases are partially configurable: an operator may override only JOIN_STAGE and inherit the
 * rest, so every key is optional.
 */
export const CommandAliasConfigSchema = z.partialRecord(GameCommandSchema, z.array(z.string()));

export type CommandAliasConfig = z.infer<typeof CommandAliasConfigSchema>;

/** A chat command after parsing, before the engine validates cooldown/eligibility. */
export interface ParsedGameCommand {
  readonly command: GameCommand;
  readonly kind: CommandKind;
  readonly userId: string;
  readonly at: number;
  /** The alias that matched, kept for diagnostics. */
  readonly matchedAlias: string;
}

/** Why the engine refused a command — surfaced to CONTROL for debugging, never to STAGE. */
export const COMMAND_REJECTIONS = [
  'cooldown',
  'queue-full',
  'already-queued',
  'already-dancing',
  'not-dancing',
  'no-free-slot',
  'unknown-user',
  'not-eligible',
  'disabled',
] as const;

export type CommandRejection = (typeof COMMAND_REJECTIONS)[number];

// ── Control commands (CONTROL → Core) ─────────────────────────────────────────────────────────

export const ControlCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('game:kick-user'), userId: NonEmptyStringSchema }),
  z.object({ type: z.literal('game:clear-stage') }),
  z.object({ type: z.literal('game:reset-ranking') }),
  z.object({ type: z.literal('game:reset-session') }),
  z.object({
    type: z.literal('game:set-party-goal'),
    enabled: z.boolean(),
    target: NonNegativeIntSchema,
  }),
  z.object({
    type: z.literal('game:set-max-dancers'),
    /** Blueprint §64: 1–30 dancers depending on performance mode. */
    maxDancers: z.number().int().min(1).max(30),
  }),
  z.object({
    type: z.literal('game:start-spotlight'),
    userId: NonEmptyStringSchema,
    durationMs: NonNegativeIntSchema,
  }),
  z.object({ type: z.literal('game:stop-spotlight') }),
]);

export type ControlCommand = z.infer<typeof ControlCommandSchema>;

export type ControlCommandType = ControlCommand['type'];

/** Envelope used when a control command is recorded/replayed. */
export interface DispatchedControlCommand {
  readonly command: ControlCommand;
  readonly at: Timestamp;
}
