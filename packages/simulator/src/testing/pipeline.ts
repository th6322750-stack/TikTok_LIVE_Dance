/**
 * Test harness that wires the PRODUCTION pipeline.
 *
 * Simulator → MockConnector → Normalizer → Core Engine → captured engine events.
 *
 * Every simulator test goes through this, which is what proves the simulator never shortcuts to
 * STAGE (Blueprint §53). The composition root in `apps/desktop` wires the very same chain.
 */

import {
  createNormalizerRegistry,
  ManualScheduler,
  MockConnector,
  ReplayConnector,
  type RecordedSession,
} from '@dance-arena/connectors';
import type { EngineConfigInput, EngineEvent, LiveEvent } from '@dance-arena/contracts';
import {
  createGameEngine,
  createFixedClock,
  createSequentialIdGenerator,
  type GameEngine,
} from '@dance-arena/core-engine';

import { createSimulator, type Simulator } from '../simulator.js';

export interface Pipeline {
  readonly scheduler: ManualScheduler;
  readonly connector: MockConnector;
  readonly engine: GameEngine;
  readonly simulator: Simulator;
  readonly engineEvents: EngineEvent[];
  readonly normalizedEvents: LiveEvent[];
  readonly dropped: { reason: string; detail?: string }[];
  connect(): Promise<void>;
  advance(ms: number): void;
}

export function createPipeline(config: EngineConfigInput = {}): Pipeline {
  const scheduler = new ManualScheduler(1_000);
  const clock = createFixedClock(1_000);
  const connector = new MockConnector({ scheduler });
  const normalizer = createNormalizerRegistry();

  const engine = createGameEngine({
    clock,
    ids: createSequentialIdGenerator(),
    config,
  });

  const engineEvents: EngineEvent[] = [];
  const normalizedEvents: LiveEvent[] = [];
  const dropped: { reason: string; detail?: string }[] = [];

  engine.subscribe((event) => engineEvents.push(event));

  connector.onEvent((raw) => {
    const result = normalizer.normalize(raw);
    if (!result.ok) {
      dropped.push({
        reason: result.reason,
        ...(result.detail === undefined ? {} : { detail: result.detail }),
      });
      return;
    }

    normalizedEvents.push(result.event);
    engine.handleEvent(result.event);
  });

  const simulator = createSimulator({ connector, scheduler });

  return {
    scheduler,
    connector,
    engine,
    simulator,
    engineEvents,
    normalizedEvents,
    dropped,
    async connect(): Promise<void> {
      const connecting = connector.connect({ target: '@sim' });
      scheduler.advance(0);
      await connecting;
    },
    advance(ms: number): void {
      clock.advance(ms);
      scheduler.advance(ms);
    },
  };
}

/** Same pipeline, but fed by a ReplayConnector instead of the simulator. */
export function createReplayPipeline(
  session: RecordedSession,
  options: { speed?: number; config?: EngineConfigInput } = {},
): Omit<Pipeline, 'connector' | 'simulator'> & { replay: ReplayConnector } {
  const scheduler = new ManualScheduler(1_000);
  const clock = createFixedClock(1_000);
  const normalizer = createNormalizerRegistry();

  const engine = createGameEngine({
    clock,
    ids: createSequentialIdGenerator(),
    config: options.config ?? {},
  });

  const engineEvents: EngineEvent[] = [];
  const normalizedEvents: LiveEvent[] = [];
  const dropped: { reason: string; detail?: string }[] = [];

  engine.subscribe((event) => engineEvents.push(event));

  const replay = new ReplayConnector({
    scheduler,
    session,
    ...(options.speed === undefined ? {} : { speed: options.speed }),
  });

  replay.onEvent((raw) => {
    const result = normalizer.normalize(raw);
    if (!result.ok) {
      dropped.push({
        reason: result.reason,
        ...(result.detail === undefined ? {} : { detail: result.detail }),
      });
      return;
    }

    normalizedEvents.push(result.event);
    engine.handleEvent(result.event);
  });

  return {
    scheduler,
    engine,
    replay,
    engineEvents,
    normalizedEvents,
    dropped,
    async connect(): Promise<void> {
      await replay.connect({ target: '@replay' });
    },
    advance(ms: number): void {
      clock.advance(ms);
      scheduler.advance(ms);
    },
  };
}
