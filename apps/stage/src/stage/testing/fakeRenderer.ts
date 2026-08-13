/**
 * Fake renderer implementing the `StageRenderer` port.
 *
 * Lets the whole snapshot/incremental/theme contract be tested without WebGL, and records every
 * call so a test can assert that the scene bound the right APPROVED asset to each slot and that it
 * patched instead of rebuilding.
 */

import type { ResolvedTheme } from '@dance-arena/assets';
import type {
  NormalizedPosition,
  PartyGoalState,
  PerformanceProfile,
  StageDancer,
  StageEventOf,
  StageRankingEntry,
} from '@dance-arena/contracts';

import type {
  DancerView,
  DancerVisual,
  GiftEffectVisual,
  HostOverlayVisual,
  StageRenderer,
} from '../stageScene.js';

export interface FakeDancerRecord {
  dancer: StageDancer;
  position: NormalizedPosition;
  visual: DancerVisual;
  rank: number | undefined;
  destroyed: boolean;
  moves: number;
  visualUpdates: number;
}

export interface FakeEffectRecord {
  readonly event: StageEventOf<'stage:gift-effect'>;
  readonly visual: GiftEffectVisual;
  stopped: boolean;
}

export interface FakeHostOverlayRecord {
  readonly overlayId: string;
  readonly visual: HostOverlayVisual;
  hidden: boolean;
}

export interface FakeRenderer extends StageRenderer {
  readonly created: FakeDancerRecord[];
  readonly effects: FakeEffectRecord[];
  readonly announcements: string[];
  readonly hostOverlays: FakeHostOverlayRecord[];
  readonly themeApplications: { theme: ResolvedTheme; profile: PerformanceProfile }[];
  clears: number;
  ranking: readonly StageRankingEntry[];
  partyGoal: PartyGoalState | undefined;
  spotlightUserId: string | undefined;
  liveDancers(): FakeDancerRecord[];
  playingEffects(): FakeEffectRecord[];
  visibleHostOverlays(): FakeHostOverlayRecord[];
  recordFor(userId: string): FakeDancerRecord | undefined;
}

export function createFakeRenderer(): FakeRenderer {
  const created: FakeDancerRecord[] = [];
  const effects: FakeEffectRecord[] = [];
  const announcements: string[] = [];
  const hostOverlays: FakeHostOverlayRecord[] = [];
  const themeApplications: { theme: ResolvedTheme; profile: PerformanceProfile }[] = [];

  const renderer: FakeRenderer = {
    created,
    effects,
    announcements,
    hostOverlays,
    themeApplications,
    clears: 0,
    ranking: [],
    partyGoal: undefined,
    spotlightUserId: undefined,

    applyTheme(theme, profile) {
      themeApplications.push({ theme, profile });
    },

    createDancer(
      dancer: StageDancer,
      position: NormalizedPosition,
      visual: DancerVisual,
    ): DancerView {
      const record: FakeDancerRecord = {
        dancer,
        position,
        visual,
        rank: dancer.rank,
        destroyed: false,
        moves: 0,
        visualUpdates: 0,
      };
      created.push(record);

      return {
        moveTo(next: NormalizedPosition, nextDancer: StageDancer): void {
          record.position = next;
          record.dancer = nextDancer;
          record.moves += 1;
        },
        setRank(rank: number | undefined, nextVisual: DancerVisual): void {
          record.rank = rank;
          record.visual = nextVisual;
          record.visualUpdates += 1;
        },
        destroy(): void {
          record.destroyed = true;
        },
      };
    },

    playGiftEffect(event, visual) {
      effects.push({ event, visual, stopped: false });
    },

    stopGiftEffect(effectId) {
      for (const effect of effects) {
        const id = `${effect.event.userId}:${effect.event.at}:${effect.event.tierId}`;
        if (id === effectId) effect.stopped = true;
      }
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

    showHostOverlay(overlayId, visual) {
      hostOverlays.push({ overlayId, visual, hidden: false });
    },

    hideHostOverlay(overlayId) {
      for (const overlay of hostOverlays) {
        if (overlay.overlayId === overlayId) overlay.hidden = true;
      }
    },

    clear() {
      renderer.clears += 1;
    },

    liveDancers: () => created.filter((record) => !record.destroyed),
    playingEffects: () => effects.filter((effect) => !effect.stopped),
    visibleHostOverlays: () => hostOverlays.filter((overlay) => !overlay.hidden),
    recordFor: (userId) =>
      created.find((record) => !record.destroyed && record.dancer.userId === userId),
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
