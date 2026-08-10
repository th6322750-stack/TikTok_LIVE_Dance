/**
 * Engine configuration (Blueprint §18, §19, §20, §22, §25, §26, §64).
 *
 * Everything tunable lives here so no gameplay rule is hard-coded deep inside an engine module.
 */

import { z } from 'zod';

import { NonEmptyStringSchema, NonNegativeIntSchema, PositiveIntSchema } from '../common.js';
import { CommandAliasConfigSchema } from './commands.js';

// ── Cooldowns (§18) ───────────────────────────────────────────────────────────────────────────

export const CommandCooldownConfigSchema = z.object({
  join: NonNegativeIntSchema,
  movement: NonNegativeIntSchema,
  vip: NonNegativeIntSchema,
});

export type CommandCooldownConfig = z.infer<typeof CommandCooldownConfigSchema>;

// ── Queue priority (§20) ──────────────────────────────────────────────────────────────────────

export const PRIORITY_MODES = [
  'fifo',
  'gift-priority',
  'highest-diamond',
  'recent-supporter',
  'random',
] as const;

export type PriorityMode = (typeof PRIORITY_MODES)[number];

export const PriorityModeSchema = z.enum(PRIORITY_MODES);

// ── Gift tiers (§26) ──────────────────────────────────────────────────────────────────────────

export const GiftTierSchema = z.object({
  id: NonEmptyStringSchema,
  minDiamonds: NonNegativeIntSchema,
  maxDiamonds: NonNegativeIntSchema.optional(),
  effectPreset: NonEmptyStringSchema,
  /** Effect duration in ms. */
  duration: NonNegativeIntSchema,
  /** Higher wins when several effects compete for the stage. */
  priority: NonNegativeIntSchema,
});

export type GiftTier = z.infer<typeof GiftTierSchema>;

/** Default tiers from Blueprint §26: 1–9, 10–49, 50–199, 200–999, 1000+. */
export const DEFAULT_GIFT_TIERS: readonly GiftTier[] = [
  {
    id: 'tier-1',
    minDiamonds: 1,
    maxDiamonds: 9,
    effectPreset: 'spark',
    duration: 1500,
    priority: 1,
  },
  {
    id: 'tier-2',
    minDiamonds: 10,
    maxDiamonds: 49,
    effectPreset: 'hearts',
    duration: 2500,
    priority: 2,
  },
  {
    id: 'tier-3',
    minDiamonds: 50,
    maxDiamonds: 199,
    effectPreset: 'stars',
    duration: 4000,
    priority: 3,
  },
  {
    id: 'tier-4',
    minDiamonds: 200,
    maxDiamonds: 999,
    effectPreset: 'aurora',
    duration: 6000,
    priority: 4,
  },
  { id: 'tier-5', minDiamonds: 1000, effectPreset: 'mega-cosmic', duration: 8000, priority: 5 },
];

// ── Slots (§22) ───────────────────────────────────────────────────────────────────────────────

export const SlotDefinitionSchema = z.object({
  slotId: NonEmptyStringSchema,
  zone: z.enum(['normal', 'vip']),
  /** Normalized 0..1 position; STAGE may override with its own layout of the same slot id. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export type SlotDefinition = z.infer<typeof SlotDefinitionSchema>;

export const DEFAULT_NORMAL_SLOT_COUNT = 30;
export const DEFAULT_VIP_SLOT_COUNT = 10;

/** `normal-01 … normal-30`, `vip-01 … vip-10` (Blueprint §22). */
export function slotId(zone: 'normal' | 'vip', index: number): string {
  return `${zone}-${String(index).padStart(2, '0')}`;
}

/**
 * Default logical slot layout in normalized coordinates.
 *
 * Normal dancers fill a grid across the lower two thirds of the 9:16 stage; VIP dancers sit on a
 * podium row above them. STAGE is free to remap the same slot ids (Blueprint §22).
 */
export function createDefaultSlotLayout(
  normalCount: number = DEFAULT_NORMAL_SLOT_COUNT,
  vipCount: number = DEFAULT_VIP_SLOT_COUNT,
): SlotDefinition[] {
  const slots: SlotDefinition[] = [];

  const normalColumns = 6;
  const normalRows = Math.max(1, Math.ceil(normalCount / normalColumns));
  for (let index = 0; index < normalCount; index += 1) {
    const column = index % normalColumns;
    const row = Math.floor(index / normalColumns);
    slots.push({
      slotId: slotId('normal', index + 1),
      zone: 'normal',
      x: round3((column + 0.5) / normalColumns),
      y: round3(0.52 + (row + 0.5) * (0.44 / normalRows)),
    });
  }

  for (let index = 0; index < vipCount; index += 1) {
    const column = index % 5;
    const row = Math.floor(index / 5);
    slots.push({
      slotId: slotId('vip', index + 1),
      zone: 'vip',
      x: round3((column + 0.5) / 5),
      y: round3(0.3 + row * 0.12),
    });
  }

  return slots;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ── Engine config ─────────────────────────────────────────────────────────────────────────────

export const EngineConfigSchema = z.object({
  /** Blueprint §64: 15 (LOW) / 25 (BALANCED) / 30 (ULTRA). */
  maxDancers: z.number().int().min(1).max(30),
  maxQueueSize: PositiveIntSchema,
  vipCapacity: PositiveIntSchema,
  /** How many ranking entries are published to renderers. */
  rankingSize: PositiveIntSchema,
  cooldowns: CommandCooldownConfigSchema,
  priorityMode: PriorityModeSchema,
  aliases: CommandAliasConfigSchema,
  giftTiers: z.array(GiftTierSchema).min(1),
  slots: z.array(SlotDefinitionSchema).min(1),
  /**
   * Fallback deduplication window for gifts without a transaction id (Blueprint §13):
   * `userId + giftId + timestampWindow`.
   */
  giftDedupWindowMs: NonNegativeIntSchema,
  partyGoal: z.object({
    enabled: z.boolean(),
    target: NonNegativeIntSchema,
    /** Multiply the target after each completion (1 = keep the same target). */
    growthFactor: z.number().min(1),
  }),
  /** Auto-promote the next queued user whenever a dancer slot frees up. */
  autoPromoteFromQueue: z.boolean(),
  spotlightDurationMs: NonNegativeIntSchema,
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export type EngineConfigInput = Partial<Omit<EngineConfig, 'cooldowns' | 'partyGoal'>> & {
  cooldowns?: Partial<CommandCooldownConfig>;
  partyGoal?: Partial<EngineConfig['partyGoal']>;
};
