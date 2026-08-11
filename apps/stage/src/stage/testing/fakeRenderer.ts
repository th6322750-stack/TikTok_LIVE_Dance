/**
 * Fake renderer implementing the `StageRenderer` port.
 *
 * Lets the whole snapshot/incremental contract be tested without WebGL, and records every call so
 * a test can assert that the scene did not rebuild when it should have patched.
 */

import type {
  NormalizedPosition,
  PartyGoalState,
  StageDancer,
  StageEventOf,
  StageRankingEntry,
} from '@dance-arena/contracts';

import type { DancerView, StageRenderer } from '../stageScene.js';

export interface FakeDancerRecord {
  readonly dancer: StageDancer;
  position: NormalizedPosition;
  rank: number | undefined;
  destroyed: boolean;
  moves: number;
}

export interface FakeRenderer extends StageRenderer {
  readonly created: FakeDancerRecord[];
  readonly giftEffects: StageEventOf<'stage:gift-effect'>[];
  readonly announcements: string[];
  clears: number;
  ranking: readonly StageRankingEntry[];
  partyGoal: PartyGoalState | undefined;
  spotlightUserId: string | undefined;
  liveDancers(): FakeDancerRecord[];
}

export function createFakeRenderer(): FakeRenderer {
  const created: FakeDancerRecord[] = [];
  const giftEffects: StageEventOf<'stage:gift-effect'>[] = [];
  const announcements: string[] = [];

  const renderer: FakeRenderer = {
    created,
    giftEffects,
    announcements,
    clears: 0,
    ranking: [],
    partyGoal: undefined,
    spotlightUserId: undefined,

    createDancer(dancer: StageDancer, position: NormalizedPosition): DancerView {
      const record: FakeDancerRecord = {
        dancer,
        position,
        rank: dancer.rank,
        destroyed: false,
        moves: 0,
      };
      created.push(record);

      return {
        moveTo(next: NormalizedPosition): void {
          record.position = next;
          record.moves += 1;
        },
        setRank(rank: number | undefined): void {
          record.rank = rank;
        },
        destroy(): void {
          record.destroyed = true;
        },
      };
    },

    playGiftEffect(effect) {
      giftEffects.push(effect);
    },

    setRanking(entries) {
      renderer.ranking = entries;
    },

    setPartyGoal(state) {
      renderer.partyGoal = state;
    },

    showAnnouncement(text) {
      announcements.push(text);
    },

    setSpotlight(userId) {
      renderer.spotlightUserId = userId;
    },

    clear() {
      renderer.clears += 1;
    },

    liveDancers: () => created.filter((record) => !record.destroyed),
  };

  return renderer;
}

export function makeStageDancer(
  dancerId: string,
  overrides: Partial<StageDancer> = {},
): StageDancer {
  return {
    dancerId,
    userId: `user-${dancerId}`,
    slotId: 'normal-01',
    zone: 'normal',
    costumeId: 'default',
    position: { x: 0.5, y: 0.6 },
    status: 'active',
    nickname: `Dancer ${dancerId}`,
    avatarUrl: `https://cdn.test/${dancerId}.webp`,
    ...overrides,
  };
}
