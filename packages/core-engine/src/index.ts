/**
 * `@dance-arena/core-engine` — canonical game state and gameplay rules.
 *
 * Blueprint: §14–§27
 *
 * Responsibility
 * - Owns the canonical `GameState` (session, users, queue, dancers, ranking, VIP, party goal).
 * - Applies normalized events and validated commands; emits control/stage events.
 * - Deterministic and unit-testable in isolation.
 *
 * Boundaries
 * - No Electron, React or PixiJS imports.
 * - No I/O, no Node built-ins, no hidden timers — clock, ids and randomness are injected ports.
 * - Never accepts raw provider payloads; only normalized contracts.
 */

import { CONTRACTS_SCHEMA_VERSION, type WorkspaceModuleInfo } from '@dance-arena/contracts';

export { createGameEngine, type GameEngine, type GameEngineOptions } from './engine.js';
export { DEFAULT_ENGINE_CONFIG, resolveEngineConfig } from './config.js';
export {
  createFixedClock,
  createSeededRandom,
  createSequentialIdGenerator,
  type Clock,
  type IdGenerator,
  type RandomSource,
} from './ports.js';
export { CooldownTracker, parseCommand, type CommandMatch } from './modules/commandParser.js';
export {
  GiftDeduplicationService,
  type GiftCredit,
  type GiftCreditInput,
} from './modules/giftDeduplication.js';
export { computeRanking, resolveGiftTier, type RankingComputation } from './modules/ranking.js';
export {
  computePriorityScore,
  createQueueComparator,
  sortQueue,
  type PriorityContext,
  type QueueComparator,
} from './modules/queue.js';
export { neighbourSlot, positionOf, SlotAllocator } from './modules/slots.js';

// ── Auto Host (Blueprint §49, Task 10) ────────────────────────────────────────────────────────
export {
  createAutoHostRuleEngine,
  type AutoHostRuleEngine,
  type AutoHostRuleEngineOptions,
} from './autohost/ruleEngine.js';
export { conditionsMatch, evaluateCondition } from './autohost/conditions.js';
export {
  dedupKeyFor,
  renderTemplate,
  sanitizeText,
  templateVariablesFor,
  type TemplateRenderOptions,
  type TemplateRenderResult,
} from './autohost/templates.js';
export {
  createDefaultAutoHostConfig,
  DEFAULT_AUTO_HOST_CONFIG,
  VIETNAMESE_DEFAULT_RULES,
} from './autohost/defaultPreset.js';

export const CORE_ENGINE_MODULE = {
  id: '@dance-arena/core-engine',
  layer: 'domain',
  contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
} satisfies WorkspaceModuleInfo;
