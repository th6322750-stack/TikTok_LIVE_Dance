/**
 * DancerView (Blueprint §31).
 *
 * Composition: BodySprite → AvatarMask → NameLabel → RankBadge.
 *
 * Task 06 uses PLACEHOLDER primitives only. The production chibi/VIP costume art is Task 09 and is
 * supplied by the System Architect — nothing here should be mistaken for final art.
 */

import type { NormalizedPosition, StageDancer } from '@dance-arena/contracts';
import { Container, Graphics, Sprite, Text } from 'pixi.js';

import type { DancerView } from '../stageScene.js';
import type { StageSize } from '../stageSize.js';
import { loadAvatarTexture } from './avatarCache.js';

const BODY_WIDTH = 54;
const BODY_HEIGHT = 84;
const AVATAR_RADIUS = 22;

const ZONE_COLORS: Record<string, number> = {
  normal: 0x3a3a5c,
  vip: 0x8a6a1f,
};

export interface PixiDancerViewOptions {
  readonly parent: Container;
  readonly design: StageSize;
  readonly dancer: StageDancer;
  readonly position: NormalizedPosition;
  /** Called when the dancer must move between the normal and VIP layers. */
  readonly reparent: (view: Container, zone: StageDancer['zone']) => void;
}

export function createPixiDancerView(options: PixiDancerViewOptions): DancerView {
  const root = new Container();
  root.label = `dancer:${options.dancer.dancerId}`;

  const body = new Graphics();
  const avatar = new Sprite();
  const avatarMask = new Graphics();
  const name = new Text({
    text: options.dancer.nickname,
    style: { fill: 0xf0f0ff, fontSize: 13, fontFamily: 'system-ui, sans-serif' },
  });
  const badge = new Text({
    text: '',
    style: { fill: 0xffd28a, fontSize: 12, fontFamily: 'system-ui, sans-serif' },
  });

  avatar.anchor.set(0.5);
  avatar.width = AVATAR_RADIUS * 2;
  avatar.height = AVATAR_RADIUS * 2;
  avatar.y = -BODY_HEIGHT / 2 - AVATAR_RADIUS + 6;
  avatar.mask = avatarMask;

  avatarMask.circle(0, avatar.y, AVATAR_RADIUS).fill(0xffffff);

  name.anchor.set(0.5);
  name.y = BODY_HEIGHT / 2 + 10;

  badge.anchor.set(0.5);
  badge.y = -BODY_HEIGHT / 2 - AVATAR_RADIUS * 2 - 2;

  root.addChild(body, avatarMask, avatar, name, badge);
  options.parent.addChild(root);

  let currentZone = options.dancer.zone;

  const drawBody = (zone: StageDancer['zone']): void => {
    body
      .clear()
      .roundRect(-BODY_WIDTH / 2, -BODY_HEIGHT / 2, BODY_WIDTH, BODY_HEIGHT, 12)
      .fill(ZONE_COLORS[zone] ?? ZONE_COLORS.normal ?? 0x3a3a5c)
      .stroke({ color: zone === 'vip' ? 0xffd28a : 0x55557a, width: 2 });
  };

  const place = (position: NormalizedPosition): void => {
    root.x = position.x * options.design.width;
    root.y = position.y * options.design.height;
  };

  const setRank = (rank: number | undefined): void => {
    badge.text = rank === undefined ? '' : `#${rank}`;
    badge.visible = rank !== undefined;
  };

  drawBody(currentZone);
  place(options.position);
  setRank(options.dancer.rank);

  void loadAvatarTexture(options.dancer.avatarUrl).then((texture) => {
    if (root.destroyed) return;

    avatar.texture = texture;
    avatar.width = AVATAR_RADIUS * 2;
    avatar.height = AVATAR_RADIUS * 2;
  });

  return {
    moveTo(position: NormalizedPosition, dancer: StageDancer): void {
      if (dancer.zone !== currentZone) {
        currentZone = dancer.zone;
        drawBody(currentZone);
        options.reparent(root, currentZone);
      }

      name.text = dancer.nickname;
      place(position);
    },

    setRank,

    destroy(): void {
      root.destroy({ children: true });
    },
  };
}
