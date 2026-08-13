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
import type { RankLayout, ResolvedAsset, ResolvedTheme } from '@dance-arena/assets';
import {
  bubbleFor,
  costumeFor,
  giftTierFor,
  hostEffectFor,
  rankTierFor,
  reactionFor,
} from '@dance-arena/assets';

import { resolveEffectCoverage } from './effectCoverage.js';
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
  /** Approved crown/badge scale from the contract (DA-QA-003), never a renderer constant. */
  readonly rankLayout: RankLayout;
}

export interface GiftEffectVisual {
  readonly asset?: ResolvedAsset;
  readonly durationMs: number;
  readonly weight: number;
  readonly particleScale: number;
  /**
   * Sprite width as a fraction of stage width, already respecting the contract's takeover floors
   * and small-tier cap (DA-QA-005). The renderer applies it verbatim.
   */
  readonly coverage: number;
}

/**
 * One Auto Host overlay: a reaction face, a command bubble or a celebration effect (Task 10 §8).
 *
 * The variant is SEMANTIC and the asset is already resolved through the theme. `asset` may be
 * undefined when the theme does not bind that slot — the renderer then degrades visibly instead of
 * substituting artwork of its own.
 */
export interface HostOverlayVisual {
  readonly kind: 'reaction' | 'bubble' | 'effect';
  readonly variant: string;
  readonly asset?: ResolvedAsset;
  readonly durationMs: number;
  /** Anchor near the user's dancer when they are on stage; otherwise a stage-level default. */
  readonly anchor?: NormalizedPosition;
  /** Width as a fraction of stage width. */
  readonly coverage: number;
  readonly ruleId: string;
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
  /** Shows one Auto Host overlay. The scene guarantees a later `hideHostOverlay` for the same id. */
  showHostOverlay(overlayId: string, visual: HostOverlayVisual): void;
  hideHostOverlay(overlayId: string): void;
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
  /** Auto Host overlays currently on screen. Bounded and self-cleaning (Task 10 §8). */
  readonly hostOverlayCount: number;
  /** Theme slots an Auto Host event asked for and the theme could not bind. */
  readonly unresolvedHostSlots: readonly string[];
}

interface TrackedDancer {
  readonly view: DancerView;
  dancer: StageDancer;
  position: NormalizedPosition;
  visual: DancerVisual;
}

/**
 * Concurrency cap for Auto Host overlays.
 *
 * A spam burst must not stack hundreds of sprites: the oldest overlay is retired to make room, so
 * repeated events can never grow the display list (Task 10 §8 "must not leak Pixi display
 * objects").
 */
const MAX_HOST_OVERLAYS = 6;

/** Overlay size as a fraction of stage width, by kind. */
const HOST_OVERLAY_COVERAGE = { reaction: 0.18, bubble: 0.22, effect: 0.55 } as const;

/** Where an overlay sits when the triggering viewer has no dancer on stage. */
const HOST_OVERLAY_DEFAULT_ANCHOR = { reaction: 0.34, bubble: 0.3, effect: 0.5 } as const;

export function createStageScene(options: StageSceneOptions): StageScene {
  const dancers = new Map<string, TrackedDancer>();

  let theme = options.theme;
  let profile = options.profile ?? DEFAULT_PERFORMANCE_PROFILES.BALANCED;
  const now = options.now ?? ((): number => Date.now());

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
      rankLayout: theme.rankLayout,
      ...(body === undefined ? {} : { body }),
      // R2 sockets differ per body, so this must come from the asset, never from a shared default.
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

  // ── Auto Host overlays (Task 10 §8) ─────────────────────────────────────────────────────────

  /** `overlayId -> expiry`. Every entry is retired by `update()` or by the concurrency cap. */
  const hostOverlays = new Map<string, number>();
  const unresolvedHostSlots: string[] = [];

  function dancerAnchorOf(userId: string | undefined): NormalizedPosition | undefined {
    if (userId === undefined) return undefined;

    for (const tracked of dancers.values()) {
      if (tracked.dancer.userId === userId) return tracked.position;
    }

    return undefined;
  }

  function retireHostOverlay(overlayId: string): void {
    if (!hostOverlays.delete(overlayId)) return;

    options.renderer.hideHostOverlay(overlayId);
  }

  function showHostOverlay(
    overlayId: string,
    kind: HostOverlayVisual['kind'],
    variant: string,
    asset: ResolvedAsset | undefined,
    durationMs: number,
    userId: string | undefined,
    at: number,
    ruleId: string,
  ): void {
    if (asset === undefined) {
      // Visible degradation, never a silent substitution: the renderer draws a defect marker and
      // the slot is reported so QA can see it (Task 10 §8).
      const slot = `${kind}.${variant}`;
      if (!unresolvedHostSlots.includes(slot)) unresolvedHostSlots.push(slot);
      console.warn(`[stage] unresolved Auto Host slot: ${slot}`);
    }

    // Retire the oldest overlay when the cap is reached, so a burst cannot grow the display list.
    while (hostOverlays.size >= MAX_HOST_OVERLAYS) {
      const oldest = [...hostOverlays.entries()].sort((left, right) => left[1] - right[1])[0];
      if (oldest === undefined) break;

      retireHostOverlay(oldest[0]);
    }

    const anchor = dancerAnchorOf(userId);
    const visual: HostOverlayVisual = {
      kind,
      variant,
      durationMs,
      ruleId,
      coverage: HOST_OVERLAY_COVERAGE[kind],
      ...(asset === undefined ? {} : { asset }),
      ...(anchor === undefined
        ? { anchor: { x: 0.5, y: HOST_OVERLAY_DEFAULT_ANCHOR[kind] } }
        : { anchor }),
    };

    hostOverlays.set(overlayId, at + Math.max(1, durationMs));
    options.renderer.showHostOverlay(overlayId, visual);
  }

  return {
    /** Full rebuild — the ONLY operation that recreates the scene (Blueprint §29). */
    applySnapshot(snapshot: StageSnapshot): void {
      for (const dancerId of [...dancers.keys()]) remove(dancerId);
      for (const overlayId of [...hostOverlays.keys()]) retireHostOverlay(overlayId);
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

          const weight = tier?.visualWeight ?? event.priority;
          const visual: GiftEffectVisual = {
            ...(tier?.asset === undefined ? {} : { asset: tier.asset }),
            durationMs: tier?.durationMs ?? event.durationMs,
            weight,
            particleScale: profile.particleScale,
            coverage: resolveEffectCoverage({ weight, profile }),
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

        // Auto Host visuals. STAGE resolves the SEMANTIC variant through the theme; it never
        // receives an asset id and never decides whether the host should have reacted.
        case 'stage:host-reaction':
          showHostOverlay(
            event.overlayId,
            'reaction',
            event.variant,
            reactionFor(theme, event.variant),
            event.durationMs,
            event.userId,
            event.at,
            event.ruleId,
          );
          break;

        case 'stage:host-bubble':
          showHostOverlay(
            event.overlayId,
            'bubble',
            event.variant,
            bubbleFor(theme, event.variant),
            event.durationMs,
            event.userId,
            event.at,
            event.ruleId,
          );
          break;

        case 'stage:host-effect':
          // Visual only: no tier, no diamonds, no score. It does not enter the gift effect budget
          // because it is not a gift (Task 10 §10.10).
          showHostOverlay(
            event.overlayId,
            'effect',
            event.slot,
            hostEffectFor(theme, event.slot),
            event.durationMs,
            event.userId,
            event.at,
            event.ruleId,
          );
          break;
      }
    },

    update(): void {
      effects.update();

      const at = now();
      for (const [overlayId, expiresAt] of [...hostOverlays]) {
        if (at >= expiresAt) retireHostOverlay(overlayId);
      }
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

    get hostOverlayCount(): number {
      return hostOverlays.size;
    },

    get unresolvedHostSlots(): readonly string[] {
      return [...unresolvedHostSlots];
    },
  };
}
