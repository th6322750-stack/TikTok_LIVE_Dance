/**
 * Stage scene controller (Blueprint §29–§31).
 *
 * Applies ONE snapshot on start/reload and incremental events afterwards. It holds no gameplay
 * rules: it never ranks, never resolves a gift tier, never decides who is VIP — it draws what the
 * engine already decided.
 *
 * Rendering is behind a `StageRenderer` port, so this whole controller is unit-testable without
 * WebGL, which is what makes the snapshot/reload guarantees verifiable in CI.
 */

import type {
  NormalizedPosition,
  PartyGoalState,
  StageDancer,
  StageEvent,
  StageEventOf,
  StageRankingEntry,
  StageSnapshot,
} from '@dance-arena/contracts';

import type { SlotLayout } from './slotLayout.js';

export interface DancerView {
  moveTo(position: NormalizedPosition, dancer: StageDancer): void;
  setRank(rank: number | undefined): void;
  destroy(): void;
}

export interface StageRenderer {
  createDancer(dancer: StageDancer, position: NormalizedPosition): DancerView;
  playGiftEffect(effect: StageEventOf<'stage:gift-effect'>): void;
  setRanking(entries: readonly StageRankingEntry[]): void;
  setPartyGoal(state: PartyGoalState, completed: boolean): void;
  showAnnouncement(
    text: string,
    level: 'info' | 'celebration' | 'warning',
    durationMs: number,
  ): void;
  setSpotlight(userId: string | undefined): void;
  clear(): void;
}

export interface StageSceneOptions {
  readonly renderer: StageRenderer;
  readonly layout: SlotLayout;
}

export interface StageScene {
  applySnapshot(snapshot: StageSnapshot): void;
  applyEvent(event: StageEvent): void;
  readonly dancerCount: number;
  hasDancer(dancerId: string): boolean;
  positionOf(dancerId: string): NormalizedPosition | undefined;
}

interface TrackedDancer {
  readonly view: DancerView;
  dancer: StageDancer;
  position: NormalizedPosition;
}

export function createStageScene(options: StageSceneOptions): StageScene {
  const dancers = new Map<string, TrackedDancer>();

  const resolvePosition = (dancer: StageDancer): NormalizedPosition =>
    options.layout.positionOf(dancer.slotId, dancer.position);

  const spawn = (dancer: StageDancer): void => {
    // Re-spawning an existing dancer must not create a second view (Task 06: no duplicates).
    const existing = dancers.get(dancer.dancerId);
    if (existing !== undefined) {
      existing.dancer = dancer;
      existing.position = resolvePosition(dancer);
      existing.view.moveTo(existing.position, dancer);
      existing.view.setRank(dancer.rank);
      return;
    }

    const position = resolvePosition(dancer);
    const view = options.renderer.createDancer(dancer, position);
    dancers.set(dancer.dancerId, { view, dancer, position });
  };

  const remove = (dancerId: string): void => {
    const tracked = dancers.get(dancerId);
    if (tracked === undefined) return;

    tracked.view.destroy();
    dancers.delete(dancerId);
  };

  return {
    /** Full rebuild — the ONLY operation that recreates the scene (Blueprint §29). */
    applySnapshot(snapshot: StageSnapshot): void {
      for (const dancerId of [...dancers.keys()]) remove(dancerId);
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
          tracked.view.moveTo(position, dancer);
          break;
        }

        case 'stage:dancer-remove':
          remove(event.dancerId);
          break;

        case 'stage:gift-effect':
          options.renderer.playGiftEffect(event);
          break;

        case 'stage:ranking-change': {
          options.renderer.setRanking(event.entries);

          // Rank badges are display data derived from the event the engine already computed.
          const rankByUser = new Map(event.entries.map((entry) => [entry.userId, entry.rank]));
          for (const tracked of dancers.values()) {
            tracked.view.setRank(rankByUser.get(tracked.dancer.userId));
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

    get dancerCount(): number {
      return dancers.size;
    },

    hasDancer: (dancerId: string): boolean => dancers.has(dancerId),

    positionOf: (dancerId: string): NormalizedPosition | undefined =>
      dancers.get(dancerId)?.position,
  };
}
