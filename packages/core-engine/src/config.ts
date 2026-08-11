/**
 * Engine configuration defaults (Blueprint §18–§20, §22, §25, §26, §64).
 */

import {
  createDefaultSlotLayout,
  DEFAULT_COMMAND_ALIASES,
  DEFAULT_GIFT_TIERS,
  DEFAULT_NORMAL_SLOT_COUNT,
  DEFAULT_VIP_SLOT_COUNT,
  EngineConfigSchema,
  normalizeCommentText,
  type CommandAliasConfig,
  type EngineConfig,
  type EngineConfigInput,
} from '@dance-arena/contracts';

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  maxDancers: DEFAULT_NORMAL_SLOT_COUNT,
  maxQueueSize: 200,
  vipCapacity: DEFAULT_VIP_SLOT_COUNT,
  rankingSize: 10,
  cooldowns: {
    join: 5_000,
    movement: 1_000,
    vip: 10_000,
  },
  priorityMode: 'gift-priority',
  aliases: cloneAliases(DEFAULT_COMMAND_ALIASES),
  giftTiers: [...DEFAULT_GIFT_TIERS],
  slots: createDefaultSlotLayout(),
  giftDedupWindowMs: 30_000,
  partyGoal: {
    enabled: true,
    target: 5_000,
    growthFactor: 1,
  },
  autoPromoteFromQueue: true,
  spotlightDurationMs: 10_000,
};

/**
 * Merges partial input over the defaults and validates the result.
 *
 * Aliases are normalized with the same function the normalizer uses, so a config written as
 * "Vào" still matches the normalized comment "VAO" (Blueprint §11/§17).
 */
export function resolveEngineConfig(input: EngineConfigInput = {}): EngineConfig {
  const merged: EngineConfig = {
    ...DEFAULT_ENGINE_CONFIG,
    ...input,
    cooldowns: { ...DEFAULT_ENGINE_CONFIG.cooldowns, ...input.cooldowns },
    partyGoal: { ...DEFAULT_ENGINE_CONFIG.partyGoal, ...input.partyGoal },
    aliases: normalizeAliases(input.aliases ?? DEFAULT_ENGINE_CONFIG.aliases),
  };

  return EngineConfigSchema.parse(merged);
}

/** Copies the readonly defaults into a mutable, config-shaped object. */
function cloneAliases(aliases: Readonly<Record<string, readonly string[]>>): CommandAliasConfig {
  const cloned: CommandAliasConfig = {};

  for (const [command, values] of Object.entries(aliases)) {
    cloned[command as keyof CommandAliasConfig] = [...values];
  }

  return cloned;
}

function normalizeAliases(aliases: CommandAliasConfig): CommandAliasConfig {
  const normalized: CommandAliasConfig = {};

  for (const [command, values] of Object.entries(aliases)) {
    if (values === undefined) continue;
    const unique = new Set(
      values.map((value) => normalizeCommentText(value)).filter((value) => value.length > 0),
    );
    normalized[command as keyof CommandAliasConfig] = [...unique];
  }

  return normalized;
}
