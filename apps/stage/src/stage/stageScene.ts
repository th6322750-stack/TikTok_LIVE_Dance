/**
 * Stage scene controller (Blueprint §29–§31, Task 09 visual system).
 *
 * Applies ONE snapshot on start/reload and incremental events afterwards, and BINDS each engine
 * event to approved artwork:
 *
 *   engine event → theme slot → asset id → registry → renderer descriptor
 *
 * It holds no gameplay rules: it never ranks, never resolves a gift tier from diamonds and never
 * decides who is VIP — the engine already did. It also never names a file: every visual comes from
 * the resolved theme, so a new visual revision is a data swap (locked rule 2).
 *
 * Rendering is behind a `StageRenderer` port, so the whole controller — including costume binding,
 * rank visuals and the effect budget — is unit-testable without WebGL.
 */

import type {
  HeadSocket,
  NormalizedPosition,
  PartyGoalState,
  PerformanceProfile,
  StageDancer,
  StageEvent,
  StageEventOf,
  StageRankingEntry,
  StageSnapshot,
} from '@dance-arena/contracts';
import { DEFAULT_PERFORMANCE_PROFILES } from '@dance-arena/contracts';
import type { ResolvedAsset, ResolvedTheme } from '@dance-arena/assets';
import { costumeFor, giftTierFor, rankTierFor } from '@dance-arena/assets';

import { createEffectScheduler, type EffectScheduler } from './effectScheduler.js';
import type { SlotLayout } from './slotLayout.js';

/** Everything a renderer needs to draw one dancer. Assets are already resolved. */
export interface DancerVisual {
  readonly body?: ResolvedAsset;
  /** Avatar socket taken from the body asset — never guessed from costume artwork. */
  readonly headSocket?: HeadSocket;
  readonly avatarUrl?: string;
  readonly avatarFallback?: ResolvedAsset;
  readonly badge?: ResolvedAsset;
  readonly accessory?: ResolvedAsset;
  /** Palette colour for the rank aura, resolved from the theme palette. */
  readonly auraColor?: string;
}

export interface GiftEffectVisual {
  readonly asset?: ResolvedAsset;
  readonly durationMs: number;
  readonly weight: number;
  readonly particleScale: number;
}

export interface DancerView {
  moveTo(position: NormalizedPosition, dancer: StageDancer): void;
  setRank(rank: number | undefined, visual: DancerVisual): void;
  destroy(): void;
}

export interface StageRenderer {
  createDancer(dancer: StageDancer, position: NormalizedPosition, visual: DancerVisual): DancerView;
  playGiftEffect(effect: StageEventOf<'stage:gift-effect'>, visual: GiftEffectVisual): void;
  stopGiftEffect(effectId: string): void;
  setRanking(entries: readonly StageRankingEntry[]): void;
  setPartyGoal(state: PartyGoalState, completed: boolean): void;
  showAnnouncement(
    text: string,
    level: 'info' | 'celebration' | 'warning',
    durationMs: number,
  ): void;
  setSpotlight(userId: string | undefined): void;
  /** Applies the theme's background/environment/UI artwork. */
  applyTheme(theme: ResolvedTheme, profile: PerformanceProfile): void;
  clear(): void;
}

export interface StageSceneOptions {
  readonly renderer: StageRenderer;
  readonly layout: SlotLayout;
  readonly theme: ResolvedTheme;
  readonly profile?: PerformanceProfile;
  /** Injected so the effect budget is testable with virtual time. */
  readonly now?: () => number;
}

export interface StageScene {
  applySnapshot(snapshot: StageSnapshot): void;
  applyEvent(event: StageEvent): void;
  /** Advances effect lifetimes; call once per frame. */
  update(): void;
  /** Swaps theme/performance profile without touching gameplay state. */
  setTheme(theme: ResolvedTheme, profile?: PerformanceProfile): void;
  setPerformanceProfile(profile: PerformanceProfile): void;
  readonly theme: ResolvedTheme;
  readonly profile: PerformanceProfile;
  readonly effects: EffectScheduler;
  readonly dancerCount: number;
  hasDancer(dancerId: string): boolean;
  positionOf(dancerId: string): NormalizedPosition | undefined;
  visualOf(dancerId: string): DancerVisual | undefined;
}

interface TrackedDancer {
  readonly view: DancerView;
  dancer: StageDancer;
  position: NormalizedPosition;
  visual: DancerVisual;
}

export function createStageScene(options: StageSceneOptions): StageScene {
  const dancers = new Map<string, TrackedDancer>();

  let theme = options.theme;
  let profile = options.profile ?? DEFAULT_PERFORMANCE_PROFILES.BALANCED;
  const now = options.now ?? (() => Date.now());

  /** Payloads parked until the scheduler decides to play them. */
  const queuedEffects = new Map<
    string,
    { event: StageEventOf<'stage:gift-effect'>; visual: GiftEffectVisual }
  >();

  const effects = createEffectScheduler({
    now,
    maxConcurrent: profile.maxConcurrentEffects,
    play: (effect) => {
      const queued = queuedEffects.get(effect.id);
      if (queued === undefined) return;

      options.renderer.playGiftEffect(queued.event, queued.visual);
    },
    stop: (effect) => {
      options.renderer.stopGiftEffect(effect.id);
      queuedEffects.delete(effect.id);
    },
  });

  options.renderer.applyTheme(theme, profile);

  const resolvePosition = (dancer: StageDancer): NormalizedPosition =>
    options.layout.positionOf(dancer.slotId, dancer.position);

  /** Binds a dancer to approved artwork: costume by zone, socket from the body, rank extras. */
  function visualFor(dancer: StageDancer): DancerVisual {
    const body = costumeFor(theme, dancer.userId, dancer.zone);
    const tier = dancer.rank === undefined ? undefined : rankTierFor(theme, dancer.rank);
    const aura = tier?.aura === undefined ? undefined : theme.palette[tier.aura];

    return {
      ...(body === undefined ? {} : { body }),
      ...(body?.headSocket === undefined ? {} : { headSocket: body.headSocket }),
      ...(dancer.avatarUrl === undefined ? {} : { avatarUrl: dancer.avatarUrl }),
      ...(theme.avatarFallback === undefined ? {} : { avatarFallback: theme.avatarFallback }),
      ...(tier?.badge === undefined ? {} : { badge: tier.badge }),
      ...(tier?.accessory === undefined ? {} : { accessory: tier.accessory }),
      ...(aura === undefined ? {} : { auraColor: aura }),
    };
  }

  function spawn(dancer: StageDancer): void {
    // Re-spawning an existing dancer must not create a second view (no duplicates).
    const existing = dancers.get(dancer.dancerId);
    if (existing !== undefined) {
      existing.dancer = dancer;
      existing.position = resolvePosition(dancer);
      existing.visual = visualFor(dancer);
      existing.view.moveTo(existing.position, dancer);
      existing.view.setRank(dancer.rank, existing.visual);
      return;
    }

    const position = resolvePosition(dancer);
    const visual = visualFor(dancer);
    const view = options.renderer.createDancer(dancer, position, visual);

    dancers.set(dancer.dancerId, { view, dancer, position, visual });
  }

  function remove(dancerId: string): void {
    const tracked = dancers.get(dancerId);
    if (tracked === undefined) return;

    tracked.view.destroy();
    dancers.delete(dancerId);
  }

  function rebuildVisuals(): void {
    for (const tracked of dancers.values()) {
      tracked.visual = visualFor(tracked.dancer);
      tracked.view.setRank(tracked.dancer.rank, tracked.visual);
    }
  }

  return {
    /** Full rebuild — the ONLY operation that recreates the scene (Blueprint §29). */
    applySnapshot(snapshot: StageSnapshot): void {
      for (const dancerId of [...dancers.keys()]) remove(dancerId);
      effects.clear();
      options.renderer.clear();

      for (const dancer of snapshot.dancers) spawn(dancer);

      options.renderer.setRanking(snapshot.ranking);
      options.renderer.setPartyGoal(snapshot.partyGoal, false);
      options.renderer.setSpotlight(snapshot.spotlight?.userId);
    },

    applyEvent(event: StageEvent): void {
      switch (event.type) {
        case 'stage:dancer-spawn':
          spawn(event.dancer);
          break;

        case 'stage:dancer-move': {
          const tracked = dancers.get(event.dancerId);
          if (tracked === undefined) break;

          const dancer: StageDancer = {
            ...tracked.dancer,
            slotId: event.slotId,
            zone: event.zone,
            position: event.position,
          };
          const position = options.layout.positionOf(event.slotId, event.position);

          tracked.dancer = dancer;
          tracked.position = position;
          // Zone changes swap the costume pool (normal ↔ VIP), so rebind the visual.
          tracked.visual = visualFor(dancer);
          tracked.view.moveTo(position, dancer);
          tracked.view.setRank(dancer.rank, tracked.visual);
          break;
        }

        case 'stage:dancer-remove':
          remove(event.dancerId);
          break;

        case 'stage:gift-effect': {
          // The engine already resolved the tier; the theme only says which artwork that means.
          const tier = giftTierFor(theme, event.tierId, event.effectPreset);
          const effectId = `${event.userId}:${event.at}:${event.tierId}`;

          const visual: GiftEffectVisual = {
            ...(tier?.asset === undefined ? {} : { asset: tier.asset }),
            durationMs: tier?.durationMs ?? event.durationMs,
            weight: tier?.visualWeight ?? event.priority,
            particleScale: profile.particleScale,
          };

          queuedEffects.set(effectId, { event, visual });
          effects.submit({ id: effectId, weight: visual.weight, durationMs: visual.durationMs });
          break;
        }

        case 'stage:ranking-change': {
          options.renderer.setRanking(event.entries);

          const rankByUser = new Map(event.entries.map((entry) => [entry.userId, entry.rank]));
          for (const tracked of dancers.values()) {
            const rank = rankByUser.get(tracked.dancer.userId);
            tracked.dancer = { ...tracked.dancer, ...(rank === undefined ? {} : { rank }) };
            tracked.visual = visualFor({
              ...tracked.dancer,
              ...(rank === undefined ? {} : { rank }),
            });
            tracked.view.setRank(rank, tracked.visual);
          }
          break;
        }

        case 'stage:spotlight-start':
          options.renderer.setSpotlight(event.userId);
          break;

        case 'stage:spotlight-end':
          options.renderer.setSpotlight(undefined);
          break;

        case 'stage:announcement':
          options.renderer.showAnnouncement(event.text, event.level, event.durationMs);
          break;

        case 'stage:party-goal':
          options.renderer.setPartyGoal(event.state, event.completed);
          break;
      }
    },

    update(): void {
      effects.update();
    },

    /**
     * Theme swap. Gameplay state is untouched: dancers keep their ids, slots and ranks, only their
     * artwork is rebound (Task 09: "theme switch không đổi gameplay state").
     */
    setTheme(nextTheme: ResolvedTheme, nextProfile?: PerformanceProfile): void {
      theme = nextTheme;
      if (nextProfile !== undefined) profile = nextProfile;

      options.renderer.applyTheme(theme, profile);
      effects.setMaxConcurrent(profile.maxConcurrentEffects);
      rebuildVisuals();
    },

    setPerformanceProfile(nextProfile: PerformanceProfile): void {
      profile = nextProfile;
      options.renderer.applyTheme(theme, profile);
      effects.setMaxConcurrent(profile.maxConcurrentEffects);
    },

    get theme(): ResolvedTheme {
      return theme;
    },

    get profile(): PerformanceProfile {
      return profile;
    },

    effects,

    get dancerCount(): number {
      return dancers.size;
    },

    hasDancer: (dancerId: string): boolean => dancers.has(dancerId),

    positionOf: (dancerId: string): NormalizedPosition | undefined =>
      dancers.get(dancerId)?.position,

    visualOf: (dancerId: string): DancerVisual | undefined => dancers.get(dancerId)?.visual,
  };
}
