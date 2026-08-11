/**
 * Settings document (Blueprint §43–§45).
 *
 * `configVersion` is mandatory so Task 12 can migrate old documents instead of losing user config.
 * Secrets are NOT part of this document — they live in OS-backed secret storage and only their
 * presence (`apiKeyConfigured`) is ever reported to a renderer.
 */

import { z } from 'zod';

import { NonNegativeIntSchema } from './common.js';
import { CommandAliasConfigSchema, GameCommandSchema } from './game/commands.js';
import { CommandCooldownConfigSchema, GiftTierSchema, PriorityModeSchema } from './game/config.js';
import { STAGE_PRESETS } from './ipc/channels.js';

/** Current settings schema version. Bump + add a migration whenever the shape changes. */
export const SETTINGS_CONFIG_VERSION = 1;

export const StageSettingsSchema = z.object({
  preset: z.enum(STAGE_PRESETS),
  alwaysOnTop: z.boolean(),
  transparent: z.boolean(),
  openOnStartup: z.boolean(),
});

export type StageSettings = z.infer<typeof StageSettingsSchema>;

export const CommandSettingsSchema = z.object({
  aliases: CommandAliasConfigSchema,
  cooldowns: CommandCooldownConfigSchema,
  enabled: z.array(GameCommandSchema),
});

export type CommandSettings = z.infer<typeof CommandSettingsSchema>;

export const GiftSettingsSchema = z.object({
  tiers: z.array(GiftTierSchema).min(1),
  dedupWindowMs: NonNegativeIntSchema,
});

export type GiftSettings = z.infer<typeof GiftSettingsSchema>;

export const GameplaySettingsSchema = z.object({
  maxDancers: z.number().int().min(1).max(30),
  maxQueueSize: z.number().int().positive(),
  priorityMode: PriorityModeSchema,
  partyGoalEnabled: z.boolean(),
  partyGoalTarget: NonNegativeIntSchema,
});

export type GameplaySettings = z.infer<typeof GameplaySettingsSchema>;

export const ConnectionSettingsSchema = z.object({
  /** TikTok @handle. Never a credential. */
  target: z.string(),
  autoConnect: z.boolean(),
});

export type ConnectionSettings = z.infer<typeof ConnectionSettingsSchema>;

export const SettingsDocumentSchema = z.object({
  configVersion: z.number().int().positive(),
  connection: ConnectionSettingsSchema,
  stage: StageSettingsSchema,
  commands: CommandSettingsSchema,
  gift: GiftSettingsSchema,
  gameplay: GameplaySettingsSchema,
});

export type SettingsDocument = z.infer<typeof SettingsDocumentSchema>;

/** What CONTROL is allowed to see: the document plus secret *presence* only (Blueprint §45). */
export const SettingsSummarySchema = z.object({
  document: SettingsDocumentSchema,
  apiKeyConfigured: z.boolean(),
});

export type SettingsSummary = z.infer<typeof SettingsSummarySchema>;
