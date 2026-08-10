import { Application } from 'pixi.js';

import { resolveStageSize, type StageSize } from './stageSize.js';

/**
 * Creates the PixiJS application for STAGE — Task 00 skeleton.
 *
 * Blueprint §28: STAGE owns a fixed layer/z-order stack (Background → DJ → Environment →
 * NormalDancer → VIP → Particle → GiftFX → Overlay → Announcement) and renders only what stage
 * events tell it to. Layers, DancerView, snapshot handling and the stage event bus arrive in
 * Task 06; this bootstrap exists so the Pixi toolchain is proven by the build.
 */

export interface MountStageOptions {
  readonly container: HTMLElement;
  readonly size?: Partial<StageSize>;
  readonly backgroundColor?: number;
}

export interface MountedStage {
  readonly app: Application;
  readonly size: StageSize;
}

export async function mountStage(options: MountStageOptions): Promise<MountedStage> {
  const size = resolveStageSize(options.size);
  const app = new Application();

  await app.init({
    width: size.width,
    height: size.height,
    background: options.backgroundColor ?? 0x05050b,
    antialias: true,
    autoDensity: true,
    resolution: globalThis.devicePixelRatio,
  });

  options.container.appendChild(app.canvas);

  return { app, size };
}
