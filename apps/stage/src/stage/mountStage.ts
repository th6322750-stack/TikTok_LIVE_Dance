/**
 * STAGE bootstrap (Blueprint §28–§31, §60).
 *
 * Startup order:
 *   1. create the Pixi application at the 9:16 design resolution;
 *   2. build the layer stack and the scene controller;
 *   3. run the `stage:ready` handshake and rebuild from the snapshot;
 *   4. apply incremental events from then on.
 *
 * Step 3 is why a STAGE reload never loses anything: canonical state lives in the Core Engine and
 * is re-sent on every handshake.
 */

import type { DanceArenaStageBridge } from '@dance-arena/contracts';
import { Application } from 'pixi.js';

import { createPixiStageRenderer } from './pixi/pixiRenderer.js';
import { createDefaultSlotLayout } from './slotLayout.js';
import { createStageScene, type StageScene } from './stageScene.js';
import { resolveStageSize, type StageSize } from './stageSize.js';

export interface MountStageOptions {
  readonly container: HTMLElement;
  readonly size?: Partial<StageSize>;
  readonly backgroundColor?: number;
  /** Injected in tests; production reads `window.danceArenaStage`. */
  readonly bridge?: DanceArenaStageBridge | undefined;
}

export interface MountedStage {
  readonly app: Application;
  readonly scene: StageScene;
  readonly size: StageSize;
  destroy(): void;
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

  const renderer = createPixiStageRenderer({ app, design: size });
  const scene = createStageScene({ renderer, layout: createDefaultSlotLayout() });

  const applyViewport = (): void => {
    const width = options.container.clientWidth || size.width;
    const height = options.container.clientHeight || size.height;

    app.renderer.resize(width, height);
    renderer.resize({ width, height });
  };

  applyViewport();
  globalThis.addEventListener('resize', applyViewport);

  const unsubscribes: (() => void)[] = [];
  const bridge = options.bridge;

  if (bridge !== undefined) {
    unsubscribes.push(bridge.onSnapshot((snapshot) => scene.applySnapshot(snapshot)));
    unsubscribes.push(bridge.onEvent((event) => scene.applyEvent(event)));

    // Handshake last, so no event that arrives during startup is missed.
    const { snapshot } = await bridge.ready();
    scene.applySnapshot(snapshot);
  }

  return {
    app,
    scene,
    size,
    destroy(): void {
      globalThis.removeEventListener('resize', applyViewport);
      for (const unsubscribe of unsubscribes) unsubscribe();
      app.destroy(true, { children: true });
    },
  };
}
