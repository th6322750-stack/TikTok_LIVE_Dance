/**
 * Minimal STAGE consumer used by the end-to-end tests.
 *
 * WHY A LOCAL CONSUMER: dependency direction forbids `apps/desktop` importing `apps/stage`
 * (Blueprint §67), so the E2E test cannot instantiate the real `StageScene`. This applies the same
 * snapshot/incremental contract to a plain map, verifying that what leaves Main is exactly what a
 * renderer needs. The real Pixi scene is covered by `apps/stage/src/stage/stageScene.test.ts`
 * against the identical event union.
 */

import type {
  StageDancer,
  StageEvent,
  StageRankingEntry,
  StageSnapshot,
} from '@dance-arena/contracts';

export interface StageConsumer {
  applySnapshot(snapshot: StageSnapshot): void;
  applyEvent(event: StageEvent): void;
  readonly dancers: Map<string, StageDancer>;
  ranking: readonly StageRankingEntry[];
  readonly giftEffects: Extract<StageEvent, { type: 'stage:gift-effect' }>[];
  readonly announcements: string[];
  /** Simulates a window reload: everything the renderer held is gone. */
  simulateReload(): void;
  dancerFor(userId: string): StageDancer | undefined;
}

export function createStageConsumer(): StageConsumer {
  const consumer: StageConsumer = {
    dancers: new Map<string, StageDancer>(),
    ranking: [],
    giftEffects: [],
    announcements: [],

    applySnapshot(snapshot: StageSnapshot): void {
      consumer.dancers.clear();
      for (const dancer of snapshot.dancers) consumer.dancers.set(dancer.dancerId, dancer);
      consumer.ranking = snapshot.ranking;
    },

    applyEvent(event: StageEvent): void {
      switch (event.type) {
        case 'stage:dancer-spawn':
          consumer.dancers.set(event.dancer.dancerId, event.dancer);
          break;

        case 'stage:dancer-move': {
          const existing = consumer.dancers.get(event.dancerId);
          if (existing !== undefined) {
            consumer.dancers.set(event.dancerId, {
              ...existing,
              slotId: event.slotId,
              zone: event.zone,
              position: event.position,
            });
          }
          break;
        }

        case 'stage:dancer-remove':
          consumer.dancers.delete(event.dancerId);
          break;

        case 'stage:gift-effect':
          consumer.giftEffects.push(event);
          break;

        case 'stage:ranking-change':
          consumer.ranking = event.entries;
          break;

        case 'stage:announcement':
          consumer.announcements.push(event.text);
          break;

        default:
          break;
      }
    },

    simulateReload(): void {
      consumer.dancers.clear();
      consumer.ranking = [];
      consumer.giftEffects.length = 0;
      consumer.announcements.length = 0;
    },

    dancerFor(userId: string): StageDancer | undefined {
      return [...consumer.dancers.values()].find((dancer) => dancer.userId === userId);
    },
  };

  return consumer;
}
