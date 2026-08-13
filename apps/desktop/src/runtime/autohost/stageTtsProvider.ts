/**
 * `TtsProvider` backed by the STAGE window (Task 10 §6).
 *
 * ```text
 * Main TtsQueueService → typed IPC `autohost:tts-speak` → STAGE Web Speech
 *                      ← typed IPC `autohost:tts-result` ←
 * ```
 *
 * Main still owns the queue: this object only turns "speak this one utterance" into a request and
 * waits for STAGE's acknowledgement. It holds no credential — the local Web Speech path needs none
 * and Task 10 must not introduce a place to store one (§10.5).
 *
 * A missing or reloading STAGE must never deadlock the queue, so every in-flight utterance has a
 * watchdog and an explicit "STAGE went away" path that settles it as `interrupted`.
 */

import type { Scheduler } from '@dance-arena/connectors';
import type {
  TtsAvailability,
  TtsCancelRequest,
  TtsSpeakRequest,
  TtsSpeakResult,
} from '@dance-arena/contracts';

import type { TtsProvider } from './ttsQueue.js';

export interface StageTtsProviderOptions {
  readonly scheduler: Scheduler;
  /** Sends the utterance to STAGE. Returns false when no STAGE window can receive it. */
  readonly send: (request: TtsSpeakRequest) => boolean;
  readonly sendCancel: (request: TtsCancelRequest) => void;
  /** Fixed part of the watchdog; the variable part scales with the text length. */
  readonly baseTimeoutMs?: number;
  readonly maxTimeoutMs?: number;
}

export interface StageTtsProvider extends TtsProvider {
  /** STAGE reports whether `speechSynthesis` exists in its renderer. */
  setAvailability(availability: TtsAvailability): void;
  getAvailability(): TtsAvailability;
  /** Acknowledgement from STAGE for exactly one utterance. */
  resolve(result: TtsSpeakResult): void;
  /** STAGE closed or started reloading: settle the utterance in flight as interrupted. */
  handleStageGone(reason: string): void;
  dispose(): void;
}

const DEFAULT_BASE_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_TIMEOUT_MS = 45_000;
/** Rough upper bound on speaking time per character, used only for the watchdog. */
const MS_PER_CHARACTER = 200;

interface PendingSpeak {
  readonly requestId: string;
  readonly settle: (result: TtsSpeakResult) => void;
  cancelTimeout: () => void;
}

export function createStageTtsProvider(options: StageTtsProviderOptions): StageTtsProvider {
  const baseTimeoutMs = options.baseTimeoutMs ?? DEFAULT_BASE_TIMEOUT_MS;
  const maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;

  let availability: TtsAvailability = { available: false, detail: 'stage not ready' };
  let pending: PendingSpeak | undefined;
  let disposed = false;

  function settlePending(result: TtsSpeakResult): void {
    const current = pending;
    if (current === undefined) return;
    if (current.requestId !== result.requestId) return;

    pending = undefined;
    current.cancelTimeout();
    current.settle(result);
  }

  return {
    isAvailable: () => availability.available && !disposed,

    setAvailability(next: TtsAvailability): void {
      availability = next;

      // A device that just disappeared must not leave the queue waiting for an ack that will
      // never come.
      if (!next.available) {
        settlePending({
          requestId: pending?.requestId ?? '',
          status: 'interrupted',
          error: next.detail ?? 'speech device unavailable',
        });
      }
    },

    getAvailability: () => availability,

    speak(request: TtsSpeakRequest): Promise<TtsSpeakResult> {
      if (disposed || !availability.available) {
        return Promise.resolve({
          requestId: request.requestId,
          status: 'unavailable',
          error: availability.detail ?? 'no local speech device',
        });
      }

      // Defensive: the queue guarantees one at a time, but a stale in-flight request must never
      // silently leak a promise.
      settlePending({
        requestId: pending?.requestId ?? '',
        status: 'interrupted',
        error: 'superseded',
      });

      if (!options.send(request)) {
        return Promise.resolve({
          requestId: request.requestId,
          status: 'unavailable',
          error: 'stage window is not receiving',
        });
      }

      return new Promise<TtsSpeakResult>((resolve) => {
        const timeoutMs = Math.min(
          maxTimeoutMs,
          baseTimeoutMs + request.text.length * MS_PER_CHARACTER,
        );

        const cancelTimeout = options.scheduler.schedule(timeoutMs, () => {
          settlePending({
            requestId: request.requestId,
            status: 'interrupted',
            error: 'speech acknowledgement timed out',
          });
        });

        pending = { requestId: request.requestId, settle: resolve, cancelTimeout };
      });
    },

    cancel(requestId?: string): void {
      options.sendCancel(requestId === undefined ? {} : { requestId });

      // STAGE answers with an `interrupted` result; the watchdog covers the case where it cannot.
    },

    resolve(result: TtsSpeakResult): void {
      settlePending(result);
    },

    handleStageGone(reason: string): void {
      availability = { available: false, detail: reason };
      settlePending({
        requestId: pending?.requestId ?? '',
        status: 'interrupted',
        error: reason,
      });
    },

    dispose(): void {
      disposed = true;
      settlePending({
        requestId: pending?.requestId ?? '',
        status: 'interrupted',
        error: 'shutting down',
      });
    },
  };
}
