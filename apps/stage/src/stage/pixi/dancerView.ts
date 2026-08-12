/**
 * DancerView (Blueprint §31, `.dance` visual protocol).
 *
 * Composition, bottom to top: aura → body → avatar (circle-masked) → accessory → name → badge.
 *
 * The avatar is the viewer's IDENTITY, so it is composited at the body's `headSocket` taken from the
 * manifest — never at a position guessed from the costume artwork, and never replaced by it
 * (VISUAL_CONTRACT `avatarIdentity`, locked rule 4).
 */

import type { NormalizedPosition, StageDancer } from '@dance-arena/contracts';
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';

import type { DancerVisual, DancerView } from '../stageScene.js';
import type { StageSize } from '../stageSize.js';
import type { TextureCache } from './textureCache.js';

/** Rendered body height as a fraction of stage height; keeps 30 dancers readable at 720x1280. */
const BODY_HEIGHT_RATIO = 0.17;

export interface PixiDancerViewOptions {
  readonly parent: Container;
  readonly design: StageSize;
  readonly dancer: StageDancer;
  readonly position: NormalizedPosition;
  readonly visual: DancerVisual;
  readonly textures: TextureCache;
  readonly avatarTexture: (url: string | undefined) => Promise<Texture | undefined>;
  readonly reparent: (view: Container, zone: StageDancer['zone']) => void;
}

export function createPixiDancerView(options: PixiDancerViewOptions): DancerView {
  const root = new Container();
  root.label = `dancer:${options.dancer.dancerId}`;

  const aura = new Graphics();
  const body = new Sprite();
  const avatar = new Sprite();
  const avatarMask = new Graphics();
  const accessory = new Sprite();
  const name = new Text({
    text: options.dancer.nickname,
    style: { fill: 0xf0f0ff, fontSize: 13, fontFamily: 'system-ui, sans-serif' },
  });
  const badge = new Sprite();

  body.anchor.set(0.5, 1);
  avatar.anchor.set(0.5);
  accessory.anchor.set(0.5, 1);
  badge.anchor.set(0.5);
  name.anchor.set(0.5);

  avatar.mask = avatarMask;
  root.addChild(aura, body, avatarMask, avatar, accessory, name, badge);
  options.parent.addChild(root);

  let currentZone = options.dancer.zone;
  let bodyHeight = options.design.height * BODY_HEIGHT_RATIO;
  let bodyWidth = bodyHeight * 0.66;

  const place = (position: NormalizedPosition): void => {
    root.x = position.x * options.design.width;
    root.y = position.y * options.design.height;
  };

  /** Lays out every child from the body box and the manifest head socket. */
  function layout(visual: DancerVisual): void {
    const asset = visual.body;

    if (asset !== undefined) {
      // Preserve the approved aspect ratio; never stretch artwork to fit.
      bodyHeight = options.design.height * BODY_HEIGHT_RATIO;
      bodyWidth = (asset.width / asset.height) * bodyHeight;
    }

    body.width = bodyWidth;
    body.height = bodyHeight;

    const socket = visual.headSocket;
    const avatarDiameter = (socket?.radius ?? 0.165) * 2 * bodyWidth;

    avatar.width = avatarDiameter;
    avatar.height = avatarDiameter;
    // Socket y is normalized to the body box, measured from its top; the body pivot is its bottom.
    avatar.x = ((socket?.x ?? 0.5) - 0.5) * bodyWidth;
    avatar.y = -bodyHeight + (socket?.y ?? 0.245) * bodyHeight;

    avatarMask
      .clear()
      .circle(avatar.x, avatar.y, avatarDiameter / 2)
      .fill(0xffffff);

    // Crown/badge scale come from the approved contract, not from renderer constants (DA-QA-003).
    const crownWidth = bodyWidth * visual.rankLayout.crownWidthBodyRatio;
    const badgeWidth = bodyWidth * visual.rankLayout.badgeWidthBodyRatio;

    // Crown sits centred above the head silhouette; its bottom anchor keeps it off the avatar.
    accessory.width = crownWidth;
    accessory.height = crownWidth;
    accessory.x = avatar.x;
    accessory.y = avatar.y - avatarDiameter * 0.5;

    name.y = 14;

    // Badge rides the head side, close to the body, clear of the avatar circle.
    badge.width = badgeWidth;
    badge.height = badgeWidth;
    badge.x = avatar.x + avatarDiameter * 0.5 + badgeWidth * 0.35;
    badge.y = avatar.y;

    aura.clear();
    if (visual.auraColor !== undefined) {
      aura
        .ellipse(0, 0, bodyWidth * 0.62, bodyHeight * 0.14)
        .fill({ color: visual.auraColor, alpha: 0.45 });
    }
  }

  async function applyVisual(visual: DancerVisual): Promise<void> {
    layout(visual);

    const [bodyTexture, badgeTexture, accessoryTexture] = await Promise.all([
      options.textures.textureFor(visual.body),
      options.textures.textureFor(visual.badge),
      options.textures.textureFor(visual.accessory),
    ]);

    if (root.destroyed) return;

    if (bodyTexture !== undefined) body.texture = bodyTexture;

    badge.texture = badgeTexture ?? Texture.EMPTY;
    badge.visible = badgeTexture !== undefined;

    accessory.texture = accessoryTexture ?? Texture.EMPTY;
    accessory.visible = accessoryTexture !== undefined;

    // Avatar last: a failed load must leave the approved fallback head in place, never a hole.
    const avatarTexture =
      (await options.avatarTexture(visual.avatarUrl)) ??
      (await options.textures.textureFor(visual.avatarFallback));

    if (root.destroyed) return;

    avatar.texture = avatarTexture ?? Texture.EMPTY;
    avatar.visible = avatarTexture !== undefined;
    layout(visual);
  }

  place(options.position);
  void applyVisual(options.visual);

  return {
    moveTo(position: NormalizedPosition, dancer: StageDancer): void {
      if (dancer.zone !== currentZone) {
        currentZone = dancer.zone;
        options.reparent(root, currentZone);
      }

      name.text = dancer.nickname;
      place(position);
    },

    setRank(_rank: number | undefined, visual: DancerVisual): void {
      void applyVisual(visual);
    },

    destroy(): void {
      root.destroy({ children: true });
    },
  };
}
