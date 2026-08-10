/**
 * Core Game Engine — canonical game state (Blueprint §14–§27).
 *
 * Everything gameplay happens here and nowhere else. The engine:
 *  - accepts NORMALIZED events only (it has never heard of EulerStream);
 *  - owns the only canonical `GameState`;
 *  - emits a flat stream of `game:*` / `stage:*` events for the composition root to route;
 *  - is pure TypeScript: no Electron, React, PixiJS, Node built-ins, timers or ambient clocks.
 */

import {
  displayNameOf,
  type CommandRejection,
  type CommandResult,
  type ControlCommand,
  type DancerState,
  type DancerZone,
  type EngineConfig,
  type EngineConfigInput,
  type EngineEvent,
  type GameCommand,
  type GameSnapshot,
  type GameState,
  type LiveEvent,
  type LiveUser,
  type PartyGoalState,
  type QueueEntry,
  type RankingState,
  type SessionCounters,
  type SessionState,
  type SessionStats,
  type SpotlightState,
  type StageDancer,
  type StageEvent,
  type StageRankingEntry,
  type StageSnapshot,
  type Unsubscribe,
  type UserState,
  type VipState,
} from '@dance-arena/contracts';

import { resolveEngineConfig } from './config.js';
import { CooldownTracker, parseCommand } from './modules/commandParser.js';
import { GiftDeduplicationService } from './modules/giftDeduplication.js';
import { computePriorityScore, sortQueue } from './modules/queue.js';
import { computeRanking, resolveGiftTier } from './modules/ranking.js';
import { neighbourSlot, positionOf, SlotAllocator } from './modules/slots.js';
import {
  createSeededRandom,
  createSequentialIdGenerator,
  type Clock,
  type IdGenerator,
  type RandomSource,
} from './ports.js';

export interface GameEngineOptions {
  readonly clock: Clock;
  readonly ids?: IdGenerator;
  readonly random?: RandomSource;
  readonly config?: EngineConfigInput;
  /** Number of columns in the normal zone, used for DOWN movement. */
  readonly normalZoneColumns?: number;
}

export interface GameEngine {
  handleEvent(event: LiveEvent): void;
  dispatchCommand(command: ControlCommand): CommandResult;
  /** Advances time-based state (spotlight expiry, dedup pruning). No internal timers exist. */
  tick(now?: number): void;
  getState(): GameState;
  getSnapshot(): GameSnapshot;
  getStageSnapshot(): StageSnapshot;
  getStats(): SessionStats;
  getConfig(): EngineConfig;
  updateConfig(patch: EngineConfigInput): EngineConfig;
  subscribe(listener: (event: EngineEvent) => void): Unsubscribe;
}

const DEFAULT_NORMAL_COLUMNS = 6;

export function createGameEngine(options: GameEngineOptions): GameEngine {
  const clock = options.clock;
  const ids = options.ids ?? createSequentialIdGenerator();
  const random = options.random ?? createSeededRandom(1);
  const normalColumns = options.normalZoneColumns ?? DEFAULT_NORMAL_COLUMNS;

  let config = resolveEngineConfig(options.config);

  const listeners = new Set<(event: EngineEvent) => void>();
  const pending: EngineEvent[] = [];

  const cooldowns = new CooldownTracker(config.cooldowns);
  const gifts = new GiftDeduplicationService(config.giftDedupWindowMs);
  const slots = new SlotAllocator(config.slots);

  const users = new Map<string, UserState>();
  const dancers = new Map<string, DancerState>();
  let queue: QueueEntry[] = [];
  let session: SessionState = createSession(ids, clock.now());
  let ranking: RankingState = { entries: [], updatedAt: clock.now() };
  let vip: VipState = { userIds: [], capacity: config.vipCapacity };
  let partyGoal: PartyGoalState = {
    enabled: config.partyGoal.enabled,
    current: 0,
    target: config.partyGoal.target,
    completedCount: 0,
  };
  let spotlight: SpotlightState | undefined;
  let counters: SessionCounters = createCounters();

  // ── emission ────────────────────────────────────────────────────────────────────────────────

  function emit(event: EngineEvent): void {
    pending.push(event);
  }

  function flush(): void {
    if (pending.length === 0) return;

    const batch = pending.splice(0, pending.length);
    for (const event of batch) {
      for (const listener of listeners) listener(event);
    }
  }

  function log(
    kind: string,
    message: string,
    extra: { level?: 'info' | 'warn' | 'error'; userId?: string; nickname?: string } = {},
  ): void {
    emit({
      type: 'game:event-log',
      entry: {
        id: ids.next('log'),
        at: clock.now(),
        level: extra.level ?? 'info',
        kind,
        message,
        ...(extra.userId === undefined ? {} : { userId: extra.userId }),
        ...(extra.nickname === undefined ? {} : { nickname: extra.nickname }),
      },
    });
  }

  // ── projections ─────────────────────────────────────────────────────────────────────────────

  function rankOf(userId: string): number | undefined {
    return ranking.entries.find((entry) => entry.userId === userId)?.rank;
  }

  function toStageDancer(dancer: DancerState): StageDancer {
    const user = users.get(dancer.userId);
    const rank = rankOf(dancer.userId);

    return {
      dancerId: dancer.dancerId,
      userId: dancer.userId,
      slotId: dancer.slotId,
      zone: dancer.zone,
      costumeId: dancer.costumeId,
      position: dancer.position,
      status: dancer.status,
      nickname: user?.nickname ?? dancer.userId,
      ...(user?.avatarUrl === undefined ? {} : { avatarUrl: user.avatarUrl }),
      ...(rank === undefined ? {} : { rank }),
    };
  }

  function toStageRanking(): StageRankingEntry[] {
    return ranking.entries.map((entry) => {
      const user = users.get(entry.userId);
      return {
        rank: entry.rank,
        userId: entry.userId,
        nickname: user?.nickname ?? entry.userId,
        ...(user?.avatarUrl === undefined ? {} : { avatarUrl: user.avatarUrl }),
        totalDiamonds: entry.totalDiamonds,
      };
    });
  }

  function buildState(): GameState {
    return {
      session: { ...session },
      users: Object.fromEntries([...users].map(([id, user]) => [id, { ...user }])),
      dancers: [...dancers.values()].map((dancer) => ({ ...dancer })),
      queue: queue.map((entry) => ({ ...entry })),
      ranking: {
        entries: ranking.entries.map((entry) => ({ ...entry })),
        updatedAt: ranking.updatedAt,
      },
      vip: { userIds: [...vip.userIds], capacity: vip.capacity },
      partyGoal: { ...partyGoal },
      ...(spotlight === undefined ? {} : { spotlight: { ...spotlight } }),
      counters: { ...counters },
    };
  }

  function buildStats(): SessionStats {
    const [topSupporter] = ranking.entries;

    return {
      session: { ...session },
      counters: { ...counters },
      activeDancers: dancers.size,
      queueLength: queue.length,
      ...(topSupporter === undefined ? {} : { topSupporter: { ...topSupporter } }),
      partyGoal: { ...partyGoal },
    };
  }

  // ── users ───────────────────────────────────────────────────────────────────────────────────

  /** Identity is `platformUserId`. Nickname/avatar are refreshed as display data only (§10/§16). */
  function upsertUser(liveUser: LiveUser, at: number): UserState {
    const existing = users.get(liveUser.platformUserId);

    const next: UserState = {
      id: liveUser.platformUserId,
      nickname: displayNameOf(liveUser),
      totalDiamonds: existing?.totalDiamonds ?? 0,
      giftCount: existing?.giftCount ?? 0,
      follow: existing?.follow ?? false,
      lastSeenAt: at,
      ...(liveUser.uniqueId === undefined ? {} : { uniqueId: liveUser.uniqueId }),
      ...(liveUser.avatarUrl === undefined
        ? existing?.avatarUrl === undefined
          ? {}
          : { avatarUrl: existing.avatarUrl }
        : { avatarUrl: liveUser.avatarUrl }),
      ...(existing?.lastGiftAt === undefined ? {} : { lastGiftAt: existing.lastGiftAt }),
      ...(existing?.activeDancerId === undefined
        ? {}
        : { activeDancerId: existing.activeDancerId }),
      ...(existing?.queueEntryId === undefined ? {} : { queueEntryId: existing.queueEntryId }),
    };

    users.set(next.id, next);
    return next;
  }

  // ── queue / dancers ─────────────────────────────────────────────────────────────────────────

  function emitQueueUpdated(at: number): void {
    emit({ type: 'game:queue-updated', at, queue: queue.map((entry) => ({ ...entry })) });
  }

  function rescoreQueue(): void {
    for (const entry of queue) {
      entry.priorityScore = computePriorityScore(entry, config.priorityMode, { users, random });
    }
    queue = sortQueue(queue);
  }

  function joinStage(user: UserState, at: number): CommandRejection | undefined {
    if (user.activeDancerId !== undefined) return 'already-dancing';
    if (user.queueEntryId !== undefined) return 'already-queued';
    if (queue.length >= config.maxQueueSize) return 'queue-full';

    const entry: QueueEntry = {
      id: ids.next('queue'),
      userId: user.id,
      joinedAt: at,
      priorityScore: 0,
      diamondsWhileWaiting: 0,
      ...(user.lastGiftAt === undefined ? {} : { lastGiftAt: user.lastGiftAt }),
    };

    queue.push(entry);
    user.queueEntryId = entry.id;
    rescoreQueue();
    emitQueueUpdated(at);

    if (config.autoPromoteFromQueue) promoteFromQueue(at);

    return undefined;
  }

  /** Fills every free dancer slot from the queue, best priority first (Blueprint §19/§20). */
  function promoteFromQueue(at: number): void {
    let promotedAny = false;

    while (queue.length > 0 && dancers.size < config.maxDancers) {
      const slot = slots.findFreeSlot('normal');
      if (slot === undefined) break;

      const entry = queue[0];
      if (entry === undefined) break;

      const user = users.get(entry.userId);
      if (user === undefined) {
        queue.shift();
        promotedAny = true;
        continue;
      }

      queue.shift();
      delete user.queueEntryId;
      spawnDancer(user, at, 'normal');
      promotedAny = true;
    }

    if (promotedAny) emitQueueUpdated(at);
  }

  function spawnDancer(user: UserState, at: number, zone: DancerZone): DancerState | undefined {
    const slot = slots.findFreeSlot(zone);
    if (slot === undefined) return undefined;

    const dancer: DancerState = {
      dancerId: ids.next('dancer'),
      userId: user.id,
      slotId: slot.slotId,
      zone,
      costumeId: zone === 'vip' ? 'vip-default' : 'default',
      position: positionOf(slot),
      status: 'active',
      spawnedAt: at,
    };

    slots.occupy(slot.slotId, dancer.dancerId);
    dancers.set(dancer.dancerId, dancer);
    user.activeDancerId = dancer.dancerId;

    emit({ type: 'stage:dancer-spawn', at, dancer: toStageDancer(dancer) });
    log('dancer-spawn', `${user.nickname} entered the stage`, {
      userId: user.id,
      nickname: user.nickname,
    });

    return dancer;
  }

  function removeDancer(
    dancerId: string,
    at: number,
    reason: 'kicked' | 'left' | 'replaced' | 'stage-cleared' | 'session-reset',
  ): void {
    const dancer = dancers.get(dancerId);
    if (dancer === undefined) return;

    slots.release(dancer.slotId);
    dancers.delete(dancerId);

    const user = users.get(dancer.userId);
    if (user?.activeDancerId === dancerId) delete user.activeDancerId;

    emit({ type: 'stage:dancer-remove', at, dancerId, reason });
  }

  function moveDancerToSlot(
    dancer: DancerState,
    slotId: string,
    zone: DancerZone,
    at: number,
  ): void {
    const slot = slots.findSlot(slotId);
    if (slot === undefined) return;

    slots.release(dancer.slotId);
    slots.occupy(slot.slotId, dancer.dancerId);

    dancer.slotId = slot.slotId;
    dancer.zone = zone;
    dancer.position = positionOf(slot);
    dancer.costumeId = zone === 'vip' ? 'vip-default' : 'default';

    emit({
      type: 'stage:dancer-move',
      at,
      dancerId: dancer.dancerId,
      slotId: dancer.slotId,
      zone,
      position: dancer.position,
    });
  }

  function moveCommand(
    user: UserState,
    command: GameCommand,
    at: number,
  ): CommandRejection | undefined {
    if (user.activeDancerId === undefined) return 'not-dancing';

    const dancer = dancers.get(user.activeDancerId);
    if (dancer === undefined) return 'not-dancing';

    if (command === 'MOVE_VIP') {
      if (!vip.userIds.includes(user.id)) return 'not-eligible';

      const vipSlot = slots.findFreeSlot('vip');
      if (vipSlot === undefined) return 'no-free-slot';

      moveDancerToSlot(dancer, vipSlot.slotId, 'vip', at);
      return undefined;
    }

    const direction =
      command === 'MOVE_LEFT' ? 'left' : command === 'MOVE_RIGHT' ? 'right' : 'down';
    const zoneSlots = slots.slotsOfZone(dancer.zone);
    const target = neighbourSlot(zoneSlots, dancer.slotId, direction, normalColumns);

    if (target === undefined || !slots.isFree(target.slotId)) return 'no-free-slot';

    moveDancerToSlot(dancer, target.slotId, dancer.zone, at);
    return undefined;
  }

  function applyGameCommand(user: UserState, command: GameCommand, at: number): void {
    const kind =
      command === 'JOIN_STAGE' ? 'join' : command === 'MOVE_VIP' ? 'vip' : ('movement' as const);

    if (!cooldowns.isReady(user.id, kind, at)) {
      emit({ type: 'game:command-rejected', at, command, userId: user.id, reason: 'cooldown' });
      return;
    }

    const rejection =
      command === 'JOIN_STAGE' ? joinStage(user, at) : moveCommand(user, command, at);

    if (rejection !== undefined) {
      emit({ type: 'game:command-rejected', at, command, userId: user.id, reason: rejection });
      return;
    }

    cooldowns.record(user.id, kind, at);
    emit({ type: 'game:command-accepted', at, command, userId: user.id });
  }

  // ── ranking / VIP ───────────────────────────────────────────────────────────────────────────

  function updateRanking(at: number): void {
    const result = computeRanking(users.values(), {
      size: config.rankingSize,
      vipCapacity: config.vipCapacity,
      previous: ranking.entries,
      previousVip: vip.userIds,
    });

    const vipChanged = result.promoted.length > 0 || result.demoted.length > 0;
    if (!result.changed && !vipChanged) return;

    ranking = { entries: result.entries, updatedAt: at };
    vip = { userIds: result.vipUserIds, capacity: config.vipCapacity };

    emit({
      type: 'game:ranking-updated',
      at,
      ranking: { entries: [...ranking.entries], updatedAt: at },
    });
    emit({
      type: 'stage:ranking-change',
      at,
      entries: toStageRanking(),
      promoted: [...result.promoted],
      demoted: [...result.demoted],
    });

    applyVipZones(result.promoted, result.demoted, at);
  }

  /** VIP membership is decided here; STAGE only animates the resulting move (Blueprint §24). */
  function applyVipZones(promoted: string[], demoted: string[], at: number): void {
    for (const userId of demoted) {
      const dancer = findDancerByUser(userId);
      if (dancer === undefined || dancer.zone !== 'vip') continue;

      const normalSlot = slots.findFreeSlot('normal');
      if (normalSlot === undefined) {
        removeDancer(dancer.dancerId, at, 'replaced');
        continue;
      }

      moveDancerToSlot(dancer, normalSlot.slotId, 'normal', at);
    }

    for (const userId of promoted) {
      const dancer = findDancerByUser(userId);
      if (dancer === undefined || dancer.zone === 'vip') continue;

      const vipSlot = slots.findFreeSlot('vip');
      if (vipSlot === undefined) continue;

      moveDancerToSlot(dancer, vipSlot.slotId, 'vip', at);
    }
  }

  function findDancerByUser(userId: string): DancerState | undefined {
    for (const dancer of dancers.values()) {
      if (dancer.userId === userId) return dancer;
    }
    return undefined;
  }

  // ── party goal ──────────────────────────────────────────────────────────────────────────────

  function addToPartyGoal(diamonds: number, at: number): void {
    if (!partyGoal.enabled || diamonds <= 0) return;

    partyGoal = { ...partyGoal, current: partyGoal.current + diamonds };
    let completed = false;

    while (partyGoal.target > 0 && partyGoal.current >= partyGoal.target) {
      completed = true;
      partyGoal = {
        ...partyGoal,
        current: partyGoal.current - partyGoal.target,
        completedCount: partyGoal.completedCount + 1,
        target: Math.round(partyGoal.target * config.partyGoal.growthFactor),
      };
    }

    emit({ type: 'stage:party-goal', at, state: { ...partyGoal }, completed });

    if (completed) {
      emit({
        type: 'stage:announcement',
        at,
        text: 'PARTY GOAL COMPLETED!',
        level: 'celebration',
        durationMs: 5_000,
      });
    }
  }

  // ── gifts ───────────────────────────────────────────────────────────────────────────────────

  function handleGift(event: Extract<LiveEvent, { type: 'gift' }>, user: UserState): void {
    const at = event.timestamp;
    const credit = gifts.credit({ userId: user.id, gift: event.gift, at });

    if (credit.diamonds <= 0) {
      log('gift-duplicate', `Ignored duplicate/streak repeat of ${event.gift.name}`, {
        userId: user.id,
        nickname: user.nickname,
      });
      return;
    }

    user.totalDiamonds += credit.diamonds;
    user.giftCount += 1;
    user.lastGiftAt = at;

    counters.totalDiamonds += credit.diamonds;
    counters.giftCount += 1;

    const queueEntry = queue.find((entry) => entry.userId === user.id);
    if (queueEntry !== undefined) {
      queueEntry.diamondsWhileWaiting += credit.diamonds;
      queueEntry.lastGiftAt = at;
      rescoreQueue();
      emitQueueUpdated(at);
    }

    emit({ type: 'game:user-updated', at, user: { ...user } });

    const tier = resolveGiftTier(credit.diamonds, config.giftTiers);
    if (tier !== undefined) {
      const dancer = findDancerByUser(user.id);
      emit({
        type: 'stage:gift-effect',
        at,
        userId: user.id,
        ...(dancer === undefined ? {} : { dancerId: dancer.dancerId }),
        ...(event.gift.id === undefined ? {} : { giftId: event.gift.id }),
        giftName: event.gift.name,
        diamonds: credit.diamonds,
        tierId: tier.id,
        effectPreset: tier.effectPreset,
        durationMs: tier.duration,
        priority: tier.priority,
      });
    }

    updateRanking(at);
    addToPartyGoal(credit.diamonds, at);
  }

  // ── public API ──────────────────────────────────────────────────────────────────────────────

  function handleEvent(event: LiveEvent): void {
    const at = event.timestamp;
    const user = upsertUser(event.user, at);

    counters.eventCount += 1;

    switch (event.type) {
      case 'comment': {
        counters.commentCount += 1;
        const match = parseCommand(event.normalizedComment, config.aliases);
        if (match !== undefined) applyGameCommand(user, match.command, at);
        break;
      }

      case 'gift':
        handleGift(event, user);
        break;

      case 'follow':
        counters.followCount += 1;
        user.follow = true;
        break;

      case 'share':
        counters.shareCount += 1;
        break;

      case 'join':
        counters.joinCount += 1;
        break;

      case 'like':
        counters.likeCount += event.likeCount;
        break;
    }

    emit({
      type: 'game:live-event',
      at,
      eventType: event.type,
      userId: user.id,
      nickname: user.nickname,
      ...(event.type === 'gift' ? { diamonds: event.gift.totalDiamonds } : {}),
    });

    flush();
  }

  function resetSession(at: number, reason: 'session-reset' | 'stage-cleared'): void {
    for (const dancerId of [...dancers.keys()]) removeDancer(dancerId, at, reason);

    users.clear();
    queue = [];
    slots.reset();
    gifts.reset();
    cooldowns.clear();
    ranking = { entries: [], updatedAt: at };
    vip = { userIds: [], capacity: config.vipCapacity };
    partyGoal = {
      enabled: config.partyGoal.enabled,
      current: 0,
      target: config.partyGoal.target,
      completedCount: 0,
    };
    spotlight = undefined;
    counters = createCounters();
    session = createSession(ids, at);
  }

  function dispatchCommand(command: ControlCommand): CommandResult {
    const at = clock.now();
    let result: CommandResult = { ok: true };

    switch (command.type) {
      case 'game:kick-user': {
        const user = users.get(command.userId);
        if (user === undefined) {
          result = { ok: false, reason: 'unknown-user' };
          break;
        }

        if (user.activeDancerId !== undefined) removeDancer(user.activeDancerId, at, 'kicked');

        const index = queue.findIndex((entry) => entry.userId === command.userId);
        if (index >= 0) {
          queue.splice(index, 1);
          delete user.queueEntryId;
          emitQueueUpdated(at);
        }

        promoteFromQueue(at);
        log('kick', `${user.nickname} was removed from the stage`, { userId: user.id });
        break;
      }

      case 'game:clear-stage': {
        for (const dancerId of [...dancers.keys()]) removeDancer(dancerId, at, 'stage-cleared');
        promoteFromQueue(at);
        log('clear-stage', 'Stage cleared');
        break;
      }

      case 'game:reset-ranking': {
        for (const user of users.values()) {
          user.totalDiamonds = 0;
          user.giftCount = 0;
          delete user.lastGiftAt;
        }
        counters = { ...counters, totalDiamonds: 0, giftCount: 0 };
        ranking = { entries: [], updatedAt: at };
        const demoted = [...vip.userIds];
        vip = { userIds: [], capacity: config.vipCapacity };
        gifts.reset();

        emit({ type: 'game:ranking-updated', at, ranking: { entries: [], updatedAt: at } });
        emit({ type: 'stage:ranking-change', at, entries: [], promoted: [], demoted });
        applyVipZones([], demoted, at);
        log('reset-ranking', 'Ranking reset');
        break;
      }

      case 'game:reset-session': {
        resetSession(at, 'session-reset');
        emit({ type: 'game:ranking-updated', at, ranking: { entries: [], updatedAt: at } });
        emitQueueUpdated(at);
        log('reset-session', 'Session reset');
        break;
      }

      case 'game:set-party-goal': {
        partyGoal = {
          ...partyGoal,
          enabled: command.enabled,
          target: command.target,
        };
        emit({ type: 'stage:party-goal', at, state: { ...partyGoal }, completed: false });
        break;
      }

      case 'game:set-max-dancers': {
        config = { ...config, maxDancers: command.maxDancers };
        promoteFromQueue(at);
        break;
      }

      case 'game:start-spotlight': {
        const user = users.get(command.userId);
        if (user === undefined) {
          result = { ok: false, reason: 'unknown-user' };
          break;
        }

        const durationMs = command.durationMs > 0 ? command.durationMs : config.spotlightDurationMs;
        spotlight = {
          userId: command.userId,
          startedAt: at,
          endsAt: at + durationMs,
          reason: 'manual',
        };
        emit({ type: 'stage:spotlight-start', at, userId: command.userId, durationMs });
        break;
      }

      case 'game:stop-spotlight': {
        if (spotlight !== undefined) {
          emit({ type: 'stage:spotlight-end', at, userId: spotlight.userId });
          spotlight = undefined;
        }
        break;
      }
    }

    flush();
    return result;
  }

  function tick(now: number = clock.now()): void {
    if (spotlight !== undefined && now >= spotlight.endsAt) {
      emit({ type: 'stage:spotlight-end', at: now, userId: spotlight.userId });
      spotlight = undefined;
    }

    gifts.prune(now);
    flush();
  }

  return {
    handleEvent,
    dispatchCommand,
    tick,
    getState: buildState,
    getSnapshot: (): GameSnapshot => ({
      version: 1,
      generatedAt: clock.now(),
      state: buildState(),
    }),
    getStageSnapshot: (): StageSnapshot => ({
      version: 1,
      generatedAt: clock.now(),
      sessionId: session.sessionId,
      dancers: [...dancers.values()].map(toStageDancer),
      ranking: toStageRanking(),
      partyGoal: { ...partyGoal },
      ...(spotlight === undefined ? {} : { spotlight: { ...spotlight } }),
    }),
    getStats: buildStats,
    getConfig: () => config,
    updateConfig: (patch: EngineConfigInput): EngineConfig => {
      config = resolveEngineConfig({ ...config, ...patch });
      cooldowns.setCooldowns(config.cooldowns);
      gifts.setWindowMs(config.giftDedupWindowMs);
      slots.setSlots(config.slots);
      vip = { ...vip, capacity: config.vipCapacity };
      return config;
    },
    subscribe: (listener: (event: EngineEvent) => void): Unsubscribe => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createSession(ids: IdGenerator, at: number): SessionState {
  return { sessionId: ids.next('session'), status: 'active', startedAt: at };
}

function createCounters(): SessionCounters {
  return {
    totalDiamonds: 0,
    giftCount: 0,
    commentCount: 0,
    followCount: 0,
    shareCount: 0,
    joinCount: 0,
    likeCount: 0,
    eventCount: 0,
  };
}

export type { StageEvent };
