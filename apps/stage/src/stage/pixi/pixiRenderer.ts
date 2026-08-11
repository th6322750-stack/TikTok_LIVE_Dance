/**
 * PixiJS implementation of the `StageRenderer` port (Blueprint §28, §31; Task 09).
 *
 * Owns the fixed layer stack and draws the APPROVED DA-VISUAL-R1 artwork it is handed. It resolves
 * nothing itself: tier, rank band, costume and colour all arrive already decided, so there is no
 * `if (diamonds > 1000)` and no asset path anywhere in this file.
 */

import type { ResolvedAsset, ResolvedTheme } from '@dance-arena/assets';
import type {
  NormalizedPosition,
  PartyGoalState,
  PerformanceProfile,
  StageDancer,
  StageEventOf,
  StageRankingEntry,
} from '@dance-arena/contracts';
import { Container, Graphics, Sprite, Text, Texture, type Application } from 'pixi.js';

import { STAGE_LAYERS, type StageLayerName } from '../layers.js';
import { computeStageFit, type StageFit } from '../slotLayout.js';
import { DEFAULT_STAGE_SIZE, type StageSize } from '../stageSize.js';
import type { DancerView, DancerVisual, GiftEffectVisual, StageRenderer } from '../stageScene.js';
import { createPixiDancerView } from './dancerView.js';
import { createTextureCache, type TextureCache } from './textureCache.js';

export interface PixiStageRendererOptions {
  readonly app: Application;
  readonly design?: StageSize;
  readonly textures?: TextureCache;
  /** Resolves a repo-relative asset path into a loadable url. */
  readonly resolveUrl?: (path: string) => string;
  /** Avatar texture provider, backed by the AvatarCache in the app shell. */
  readonly avatarTexture?: (url: string | undefined) => Promise<Texture | undefined>;
}

export interface PixiStageRenderer extends StageRenderer {
  resize(viewport: StageSize): StageFit;
  readonly root: Container;
  readonly textures: TextureCache;
}

export function createPixiStageRenderer(options: PixiStageRendererOptions): PixiStageRenderer {
  const design = options.design ?? DEFAULT_STAGE_SIZE;
  const textures =
    options.textures ??
    createTextureCache(options.resolveUrl === undefined ? {} : { resolveUrl: options.resolveUrl });
  const avatarTexture =
    options.avatarTexture ?? ((): Promise<undefined> => Promise.resolve(undefined));

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

  const background = new Sprite();
  background.width = design.width;
  background.height = design.height;
  layerOf('background').addChild(background);

  const vipPodium = new Sprite();
  vipPodium.anchor.set(0.5, 0.5);
  vipPodium.visible = false;
  layerOf('environment').addChild(vipPodium);

  const rankingText = new Text({
    text: '',
    style: { fill: 0xf0f0ff, fontSize: 14, fontFamily: 'system-ui, sans-serif', lineHeight: 18 },
  });
  rankingText.x = 16;
  rankingText.y = 16;
  layerOf('overlay').addChild(rankingText);

  const partyGoalFrame = new Sprite();
  partyGoalFrame.anchor.set(0.5, 1);
  partyGoalFrame.visible = false;
  layerOf('overlay').addChild(partyGoalFrame);

  const partyGoalText = new Text({
    text: '',
    style: { fill: 0xffd75a, fontSize: 14, fontFamily: 'system-ui, sans-serif' },
  });
  partyGoalText.anchor.set(0.5, 1);
  layerOf('overlay').addChild(partyGoalText);

  const announcementBanner = new Sprite();
  announcementBanner.anchor.set(0.5, 0.5);
  announcementBanner.visible = false;
  layerOf('announcement').addChild(announcementBanner);

  const announcementText = new Text({
    text: '',
    style: { fill: 0xffffff, fontSize: 22, fontFamily: 'system-ui, sans-serif' },
  });
  announcementText.anchor.set(0.5, 0.5);
  announcementText.visible = false;
  layerOf('announcement').addChild(announcementText);

  const spotlight = new Graphics();
  spotlight.visible = false;
  layerOf('environment').addChild(spotlight);

  /** Live effect sprites keyed by scheduler effect id, so the scheduler can stop them. */
  const activeEffects = new Map<string, Sprite>();
  let announcementTimer: ReturnType<typeof setTimeout> | undefined;
  let currentTheme: ResolvedTheme | undefined;

  function effectIdOf(event: StageEventOf<'stage:gift-effect'>): string {
    return `${event.userId}:${event.at}:${event.tierId}`;
  }

  return {
    root,
    textures,

    applyTheme(theme: ResolvedTheme, _profile: PerformanceProfile): void {
      currentTheme = theme;

      void (async (): Promise<void> => {
        const [backgroundTexture, podiumTexture, goalFrameTexture, bannerTexture] =
          await Promise.all([
            textures.textureFor(theme.background),
            textures.textureFor(theme.vipPodium),
            textures.textureFor(theme.ui.partyGoalFrame),
            textures.textureFor(theme.ui.newVip),
          ]);

        if (backgroundTexture !== undefined) {
          background.texture = backgroundTexture;
          background.width = design.width;
          background.height = design.height;
        }

        if (podiumTexture !== undefined) {
          vipPodium.texture = podiumTexture;
          vipPodium.width = design.width * 0.92;
          vipPodium.height = design.height * 0.12;
          vipPodium.x = design.width / 2;
          // Sit the podium at the bottom edge of the VIP zone from the visual contract.
          vipPodium.y = theme.zones.vip.yMax * design.height;
          vipPodium.visible = true;
        }

        if (goalFrameTexture !== undefined) {
          partyGoalFrame.texture = goalFrameTexture;
          partyGoalFrame.width = design.width * 0.7;
          partyGoalFrame.height = design.height * 0.06;
          partyGoalFrame.x = design.width / 2;
          partyGoalFrame.y = design.height - 24;
        }

        if (bannerTexture !== undefined) {
          announcementBanner.texture = bannerTexture;
          announcementBanner.width = design.width * 0.8;
          announcementBanner.height = design.height * 0.09;
          announcementBanner.x = design.width / 2;
          announcementBanner.y = design.height * 0.16;
        }

        partyGoalText.x = design.width / 2;
        partyGoalText.y = design.height - 30;
        announcementText.x = design.width / 2;
        announcementText.y = design.height * 0.16;
      })();
    },

    createDancer(
      dancer: StageDancer,
      position: NormalizedPosition,
      visual: DancerVisual,
    ): DancerView {
      return createPixiDancerView({
        parent: layerOf(dancer.zone === 'vip' ? 'vip' : 'normalDancer'),
        design,
        dancer,
        position,
        visual,
        textures,
        avatarTexture,
        reparent: (view, zone) => {
          layerOf(zone === 'vip' ? 'vip' : 'normalDancer').addChild(view);
        },
      });
    },

    playGiftEffect(event: StageEventOf<'stage:gift-effect'>, visual: GiftEffectVisual): void {
      const id = effectIdOf(event);
      const sprite = new Sprite();

      sprite.anchor.set(0.5);
      sprite.x = design.width / 2;
      sprite.y = design.height * 0.6;

      // Coverage arrives already resolved against the contract's takeover floors and small-tier
      // cap (DA-QA-005). The renderer must NOT rescale it by particleScale again.
      sprite.width = design.width * visual.coverage;
      sprite.height = design.width * visual.coverage;
      sprite.alpha = 0;

      layerOf('giftFx').addChild(sprite);
      activeEffects.set(id, sprite);

      void textures.textureFor(visual.asset).then((texture) => {
        if (sprite.destroyed) return;
        if (texture === undefined) {
          sprite.destroy();
          activeEffects.delete(id);
          return;
        }

        sprite.texture = texture;
        sprite.alpha = 1;
      });
    },

    stopGiftEffect(effectId: string): void {
      const sprite = activeEffects.get(effectId);
      if (sprite === undefined) return;

      activeEffects.delete(effectId);
      if (!sprite.destroyed) sprite.destroy();
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
      partyGoalFrame.visible = state.enabled && partyGoalFrame.texture !== Texture.EMPTY;
    },

    showAnnouncement(
      text: string,
      _level: 'info' | 'celebration' | 'warning',
      durationMs: number,
    ): void {
      announcementText.text = text;
      announcementText.visible = true;
      announcementBanner.visible = announcementBanner.texture !== Texture.EMPTY;

      if (announcementTimer !== undefined) clearTimeout(announcementTimer);
      announcementTimer = setTimeout(
        () => {
          announcementText.visible = false;
          announcementBanner.visible = false;
        },
        Math.max(500, durationMs),
      );
    },

    setSpotlight(userId: string | undefined): void {
      spotlight.clear();
      spotlight.visible = userId !== undefined;

      if (userId === undefined) return;

      const color = currentTheme?.palette.cyan ?? '#40E9FF';
      spotlight
        .ellipse(design.width / 2, design.height * 0.62, design.width * 0.42, design.height * 0.14)
        .fill({ color, alpha: 0.1 });
    },

    clear(): void {
      layerOf('normalDancer').removeChildren();
      layerOf('vip').removeChildren();
      layerOf('giftFx').removeChildren();
      activeEffects.clear();
      rankingText.text = '';
      announcementText.visible = false;
      announcementBanner.visible = false;
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

/** Assets the theme needs before the first frame; everything else loads lazily (Blueprint §65). */
export function criticalThemeAssets(theme: ResolvedTheme): (ResolvedAsset | undefined)[] {
  return [
    theme.background,
    theme.vipPodium,
    theme.avatarFallback,
    ...theme.regularCostumes.slice(0, 4),
    ...theme.vipCostumes.slice(0, 2),
  ];
}
