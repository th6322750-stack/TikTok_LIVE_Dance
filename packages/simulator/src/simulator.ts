/**
 * Simulator facade (Blueprint §53).
 *
 * Drives a MockConnector — it never touches the engine or STAGE directly. Everything it produces
 * enters at the connector boundary and travels the production path:
 *
 *   Simulator → MockConnector → Normalizer → Core Engine → CONTROL / STAGE
 */

import type { MockConnector, Scheduler } from '@dance-arena/connectors';
import type { SimulatorEmitRequest } from '@dance-arena/contracts';

import {
  commentPayload,
  followPayload,
  giftPayload,
  joinPayload,
  likePayload,
  sharePayload,
} from './payloads.js';
import { findScenario, type Scenario } from './scenarios.js';
import { simulatedUser, type SimulatedUser } from './users.js';

export interface SimulatorOptions {
  readonly connector: MockConnector;
  readonly scheduler: Scheduler;
}

export interface Simulator {
  /** Injects one synthetic event described by a CONTROL request. */
  emit(request: SimulatorEmitRequest): boolean;
  /** Plays a named scenario; returns false when the id is unknown. */
  startScenario(scenarioId: string, speed?: number): boolean;
  stop(): void;
  isRunning(): boolean;
}

export function createSimulator(options: SimulatorOptions): Simulator {
  const { connector, scheduler } = options;
  const cancels: (() => void)[] = [];
  let running = false;
  let userCounter = 0;

  function resolveUser(request: SimulatorEmitRequest): SimulatedUser {
    if (request.userId !== undefined && request.userId.length > 0) {
      return {
        userId: request.userId,
        handle: `sim_${request.userId}`,
        displayName: request.nickname ?? `Sim ${request.userId}`,
        avatar: `https://avatars.dance-arena.test/${request.userId}.webp`,
      };
    }

    const generated = simulatedUser(userCounter);
    userCounter += 1;
    return request.nickname === undefined
      ? generated
      : { ...generated, displayName: request.nickname };
  }

  function emit(request: SimulatorEmitRequest): boolean {
    const user = resolveUser(request);
    const at = scheduler.now();

    switch (request.preset) {
      case 'comment-go':
        connector.emit(commentPayload(user, request.comment ?? 'GO', at));
        return true;

      case 'comment-move':
        connector.emit(commentPayload(user, request.comment ?? 'RIGHT', at));
        return true;

      case 'gift':
        connector.emit(
          giftPayload(user, at, {
            diamonds: request.diamonds ?? 25,
            ...(request.repeatCount === undefined ? {} : { repeatCount: request.repeatCount }),
            ...(request.streak === undefined ? {} : { streak: request.streak }),
            ...(request.streakEnded === undefined ? {} : { streakEnded: request.streakEnded }),
            transactionId: `sim-tx-${user.userId}-${at}`,
          }),
        );
        return true;

      case 'follow':
        connector.emit(followPayload(user, at));
        return true;

      case 'share':
        connector.emit(sharePayload(user, at));
        return true;

      case 'join':
        connector.emit(joinPayload(user, at));
        return true;

      case 'like':
        connector.emit(likePayload(user, at, 1));
        return true;
    }
  }

  function playScenario(scenario: Scenario, speed: number): void {
    stop();
    running = true;

    for (const scenarioStep of scenario.steps) {
      const cancel = scheduler.schedule(scenarioStep.at / speed, () => {
        // Re-stamp `at` with the wall clock so the engine sees a coherent session timeline.
        connector.emit({ ...scenarioStep.payload, at: scheduler.now() });
      });
      cancels.push(cancel);
    }

    const lastStep = scenario.steps.at(-1);
    const endsAt = lastStep === undefined ? 0 : lastStep.at / speed;
    cancels.push(
      scheduler.schedule(endsAt + 1, () => {
        running = false;
      }),
    );
  }

  function stop(): void {
    for (const cancel of cancels.splice(0, cancels.length)) cancel();
    running = false;
  }

  return {
    emit,
    startScenario(scenarioId: string, speed = 1): boolean {
      const scenario = findScenario(scenarioId);
      if (scenario === undefined) return false;

      playScenario(scenario, speed > 0 ? speed : 1);
      return true;
    },
    stop,
    isRunning: () => running,
  };
}
