/**
 * Session recorder (Blueprint §54).
 *
 * Records RAW provider events with timestamps relative to session start, so a recording made on
 * one machine at one wall-clock time replays identically anywhere.
 */

import type { RecordedSession, RecordedStep } from '@dance-arena/connectors';
import type { RawLiveEvent } from '@dance-arena/contracts';

import type { Scenario } from './scenarios.js';

export interface SessionRecorderOptions {
  readonly id: string;
  readonly startedAt: number;
  /** Cap the buffer so a long LIVE session cannot grow without bound (Blueprint §55). */
  readonly maxSteps?: number;
}

export class SessionRecorder {
  private readonly steps: RecordedStep[] = [];

  constructor(private readonly options: SessionRecorderOptions) {}

  record(event: RawLiveEvent): void {
    const max = this.options.maxSteps ?? 10_000;
    if (this.steps.length >= max) this.steps.shift();

    this.steps.push({
      at: Math.max(0, event.receivedAt - this.options.startedAt),
      event,
    });
  }

  build(): RecordedSession {
    return {
      version: 1,
      id: this.options.id,
      recordedAt: this.options.startedAt,
      steps: [...this.steps].sort((left, right) => left.at - right.at),
    };
  }

  get size(): number {
    return this.steps.length;
  }
}

/** Turns a scenario into a replayable session without running it first. */
export function scenarioToSession(scenario: Scenario, recordedAt = 0): RecordedSession {
  return {
    version: 1,
    id: scenario.id,
    recordedAt,
    steps: scenario.steps.map((scenarioStep) => ({
      at: scenarioStep.at,
      event: {
        provider: 'replay' as const,
        kind: scenarioStep.payload.kind,
        receivedAt: recordedAt + scenarioStep.at,
        payload: scenarioStep.payload,
      },
    })),
  };
}
