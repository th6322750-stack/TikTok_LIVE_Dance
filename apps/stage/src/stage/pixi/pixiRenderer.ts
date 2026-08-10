/**
 * PixiJS implementation of the `StageRenderer` port (Blueprint §28, §31).
 *
 * Owns the fixed layer stack and the placeholder visuals. It renders resolved events only — the
 * gift TIER already arrived in the event, so there is no `if (diamonds > 1000)` anywhere here.
 */

import type {
  NormalizedPosition,
  PartyGoalState,
  StageDancer,
  StageEventOf,
  StageRankingEntry,
} from '@dance-arena/contracts';
import { Container, Graphics, Text, type Application } from 'pixi.js';

import type { DancerView, StageRenderer } from '../stageScene.js';
import { computeStageFit, type StageFit } from '../slotLayout.js';
import { DEFAULT_STAGE_SIZE, type StageSize } from '../stageSize.js';
import { STAGE_LAYERS, type StageLayerName } from '../layers.js';
import { createPixiDancerView } from './dancerView.js';

/** Placeholder effect tints per preset; Task 09 replaces these with real FX assets. */
const EFFECT_COLORS: Record<string, number> = {
  spark: 0x8ad7ff,
  hearts: 0xff8ac2,
  stars: 0xffd28a,
  aurora: 0x9a8aff,
  'mega-cosmic': 0xff6a6a,
};

export interface PixiStageRendererOptions {
  readonly app: Application;
  readonly design?: StageSize;
}

export interface PixiStageRenderer extends StageRenderer {
  /** Rescales the root container so the 9:16 design keeps its aspect in any viewport. */
  resize(viewport: StageSize): StageFit;
  readonly root: Container;
}

export function createPixiStageRenderer(options: PixiStageRendererOptions): PixiStageRenderer {
  const design = options.design ?? DEFAULT_STAGE_SIZE;
  const root = new Container();
  const layers = new Map<StageLayerName, Container>();

  // Fixed z-order: the array order IS the stacking order (Blueprint §28).
  for (const name of STAGE_LAYERS) {
    const layer = new Container();
    layer.label = name;
    layers.set(name, layer);
    root.addChild(layer);
  }

  options.app.stage.addChild(root);

  const layerOf = (name: StageLayerName): Container => {
    const layer = layers.get(name);
    if (layer === undefined) throw new Error(`stage layer ${name} is missing`);
    return layer;
  };

  drawBackground(layerOf('background'), design);
  drawDjPlaceholder(layerOf('dj'), design);

  const rankingText = new Text({
    text: '',
    style: { fill: 0xf0f0ff, fontSize: 14, fontFamily: 'system-ui, sans-serif', lineHeight: 18 },
  });
  rankingText.x = 16;
  rankingText.y = 16;
  layerOf('overlay').addChild(rankingText);

  const partyGoalText = new Text({
    text: '',
    style: { fill: 0xffd28a, fontSize: 14, fontFamily: 'system-ui, sans-serif' },
  });
  partyGoalText.x = 16;
  partyGoalText.y = design.height - 32;
  layerOf('overlay').addChild(partyGoalText);

  const announcementText = new Text({
    text: '',
    style: { fill: 0xffffff, fontSize: 22, fontFamily: 'system-ui, sans-serif' },
  });
  announcementText.anchor.set(0.5, 0);
  announcementText.x = design.width / 2;
  announcementText.y = 90;
  announcementText.visible = false;
  layerOf('announcement').addChild(announcementText);

  const spotlight = new Graphics();
  spotlight.visible = false;
  layerOf('environment').addChild(spotlight);

  let announcementTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    root,

    createDancer(dancer: StageDancer, position: NormalizedPosition): DancerView {
      return createPixiDancerView({
        parent: layerOf(dancer.zone === 'vip' ? 'vip' : 'normalDancer'),
        design,
        dancer,
        position,
        reparent: (view, zone) => {
          layerOf(zone === 'vip' ? 'vip' : 'normalDancer').addChild(view);
        },
      });
    },

    playGiftEffect(effect: StageEventOf<'stage:gift-effect'>): void {
      const burst = new Graphics();
      const color = EFFECT_COLORS[effect.effectPreset] ?? 0xffffff;
      const radius = 40 + Math.min(effect.priority, 5) * 14;

      burst.circle(design.width / 2, design.height / 2, radius).fill({ color, alpha: 0.35 });
      layerOf('giftFx').addChild(burst);

      const startedAt = performance.now();
      const duration = Math.max(200, effect.durationMs);

      const fade = (): void => {
        const progress = (performance.now() - startedAt) / duration;
        if (progress >= 1 || burst.destroyed) {
          options.app.ticker.remove(fade);
          if (!burst.destroyed) burst.destroy();
          return;
        }
        burst.alpha = 1 - progress;
        burst.scale.set(1 + progress * 0.6);
      };

      options.app.ticker.add(fade);
    },

    setRanking(entries: readonly StageRankingEntry[]): void {
      rankingText.text = entries
        .slice(0, 5)
        .map((entry) => `#${entry.rank} ${entry.nickname} · ${entry.totalDiamonds}`)
        .join('\n');
    },

    setPartyGoal(state: PartyGoalState, completed: boolean): void {
      partyGoalText.text = state.enabled
        ? `PARTY GOAL ${state.current}/${state.target}${completed ? ' ✔' : ''}`
        : '';
    },

    showAnnouncement(
      text: string,
      _level: 'info' | 'celebration' | 'warning',
      durationMs: number,
    ): void {
      announcementText.text = text;
      announcementText.visible = true;

      if (announcementTimer !== undefined) clearTimeout(announcementTimer);
      announcementTimer = setTimeout(
        () => {
          announcementText.visible = false;
        },
        Math.max(500, durationMs),
      );
    },

    setSpotlight(userId: string | undefined): void {
      spotlight.clear();
      spotlight.visible = userId !== undefined;

      if (userId === undefined) return;

      spotlight
        .ellipse(design.width / 2, design.height * 0.62, design.width * 0.42, design.height * 0.14)
        .fill({ color: 0xffffff, alpha: 0.08 });
    },

    clear(): void {
      layerOf('normalDancer').removeChildren();
      layerOf('vip').removeChildren();
      layerOf('giftFx').removeChildren();
      rankingText.text = '';
      announcementText.visible = false;
    },

    resize(viewport: StageSize): StageFit {
      const fit = computeStageFit(viewport, design);
      root.scale.set(fit.scale);
      root.x = fit.offsetX;
      root.y = fit.offsetY;
      return fit;
    },
  };
}

function drawBackground(layer: Container, design: StageSize): void {
  const background = new Graphics();
  background.rect(0, 0, design.width, design.height).fill(0x0b0b16);
  background
    .rect(0, design.height * 0.5, design.width, design.height * 0.5)
    .fill({ color: 0x141426, alpha: 0.9 });
  layer.addChild(background);
}

/** DJ booth placeholder — real art arrives with the Task 09 asset pack. */
function drawDjPlaceholder(layer: Container, design: StageSize): void {
  const booth = new Graphics();
  booth
    .roundRect(
      design.width * 0.3,
      design.height * 0.16,
      design.width * 0.4,
      design.height * 0.08,
      10,
    )
    .fill({ color: 0x22223a })
    .stroke({ color: 0x3a3a5c, width: 2 });
  layer.addChild(booth);
}
