/**
 * ReplayConnector (Blueprint §54).
 *
 * Replays a recorded session through the normal connector interface so a bug can be reproduced
 * offline against the real pipeline. Playback speed changes WHEN events fire, never their order
 * or content — that property is what makes a replay a valid regression test.
 */

import { z } from 'zod';
import type {
  ConnectorConfig,
  ConnectorStatus,
  ConnectorStatusEvent,
  LiveConnector,
  RawLiveEvent,
  Unsubscribe,
} from '@dance-arena/contracts';
import { RawLiveEventSchema } from '@dance-arena/contracts';

import { Emitter } from '../support/emitter.js';
import type { CancelScheduled, Scheduler } from '../support/scheduler.js';

/** One recorded step: milliseconds since session start plus the raw provider event. */
export const RecordedStepSchema = z.object({
  at: z.number().int().nonnegative(),
  event: RawLiveEventSchema,
});

export type RecordedStep = z.infer<typeof RecordedStepSchema>;

export const RecordedSessionSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  recordedAt: z.number().int().nonnegative(),
  steps: z.array(RecordedStepSchema),
});

export type RecordedSession = z.infer<typeof RecordedSessionSchema>;

export const REPLAY_SPEEDS = [1, 2, 5] as const;

export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export interface ReplayConnectorOptions {
  readonly scheduler: Scheduler;
  readonly session: RecordedSession;
  readonly speed?: number;
  /** Called once the last step has been emitted. */
  readonly onComplete?: () => void;
}

export class ReplayConnector implements LiveConnector {
  readonly provider = 'replay';

  private status: ConnectorStatus = 'idle';
  private readonly steps: RecordedStep[];
  private cursor = 0;
  private positionMs = 0;
  private playing = false;
  private speed: number;
  private cancelPending: CancelScheduled | undefined;
  private lastResumeAt = 0;

  private readonly events = new Emitter<RawLiveEvent>();
  private readonly statuses = new Emitter<ConnectorStatusEvent>();

  constructor(private readonly options: ReplayConnectorOptions) {
    // Sorting once guarantees replay order is a property of the data, not of the recorder.
    this.steps = [...options.session.steps].sort((left, right) => left.at - right.at);
    this.speed = options.speed ?? 1;
  }

  connect(_config: ConnectorConfig): Promise<void> {
    this.setStatus('connecting');
    this.setStatus('connected');
    this.play();
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.pause();
    this.setStatus('disconnecting');
    this.setStatus('idle');
    return Promise.resolve();
  }

  onEvent(callback: (event: RawLiveEvent) => void): Unsubscribe {
    return this.events.on(callback);
  }

  onStatus(callback: (status: ConnectorStatusEvent) => void): Unsubscribe {
    return this.statuses.on(callback);
  }

  getStatus(): ConnectorStatus {
    return this.status;
  }

  play(): void {
    if (this.playing || this.cursor >= this.steps.length) return;

    this.playing = true;
    this.lastResumeAt = this.options.scheduler.now();
    this.scheduleNext();
  }

  pause(): void {
    if (!this.playing) return;

    this.positionMs += (this.options.scheduler.now() - this.lastResumeAt) * this.speed;
    this.playing = false;
    this.cancelPending?.();
    this.cancelPending = undefined;
  }

  /** Changing speed mid-playback keeps the current position; only future delays are rescaled. */
  setSpeed(speed: number): void {
    if (speed <= 0) return;

    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.speed = speed;
    if (wasPlaying) this.play();
  }

  getSpeed(): number {
    return this.speed;
  }

  /** Session-relative playback position in ms. */
  getPosition(): number {
    if (!this.playing) return this.positionMs;
    return this.positionMs + (this.options.scheduler.now() - this.lastResumeAt) * this.speed;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  get remainingSteps(): number {
    return this.steps.length - this.cursor;
  }

  private scheduleNext(): void {
    const step = this.steps[this.cursor];

    if (step === undefined) {
      this.playing = false;
      this.options.onComplete?.();
      return;
    }

    const waitMs = Math.max(0, step.at - this.getPosition()) / this.speed;

    this.cancelPending = this.options.scheduler.schedule(waitMs, () => {
      this.cancelPending = undefined;
      if (!this.playing) return;

      this.positionMs = step.at;
      this.lastResumeAt = this.options.scheduler.now();
      this.cursor += 1;
      this.events.emit(step.event);
      this.scheduleNext();
    });
  }

  private setStatus(status: ConnectorStatus): void {
    this.status = status;
    this.statuses.emit({
      provider: 'replay',
      status,
      at: this.options.scheduler.now(),
    });
  }
}
