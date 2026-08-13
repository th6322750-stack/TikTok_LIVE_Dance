/**
 * STAGE speech adapter (Task 10 §6).
 *
 * A DUMB device. It receives exactly one utterance at a time from Main, speaks it, and reports how
 * it ended. It holds no queue, no priorities, no cooldowns and no rules — those all live in Main
 * and Core, which is why a STAGE reload can interrupt speech but can never corrupt queue state.
 *
 * Exactly one result is reported per request: a late `onend` after a cancel, or an `onerror` after
 * an `onend`, is swallowed by the settled guard so Main's queue can never be advanced twice.
 */

import type { TtsCancelRequest, TtsSpeakRequest, TtsSpeakResult } from '@dance-arena/contracts';

import type { SpeechEnvironment } from './speechEnvironment.js';

export interface TtsSpeakerOptions {
  readonly environment: SpeechEnvironment;
  /** Sends the acknowledgement back to Main. */
  readonly report: (result: TtsSpeakResult) => void;
}

export interface TtsSpeaker {
  handleSpeak(request: TtsSpeakRequest): void;
  handleCancel(request: TtsCancelRequest): void;
  isSupported(): boolean;
  unsupportedReason(): string | undefined;
  /** Request currently being spoken, for tests and diagnostics. */
  readonly currentRequestId: string | undefined;
  dispose(): void;
}

export function createTtsSpeaker(options: TtsSpeakerOptions): TtsSpeaker {
  let current: TtsSpeakRequest | undefined;
  let settled = true;

  function finish(status: TtsSpeakResult['status'], error?: string): void {
    const request = current;
    if (request === undefined || settled) return;

    settled = true;
    current = undefined;

    options.report({
      requestId: request.requestId,
      status,
      ...(error === undefined ? {} : { error: error.slice(0, 200) }),
    });
  }

  return {
    isSupported: () => options.environment.isSupported(),
    unsupportedReason: () => options.environment.unsupportedReason(),

    get currentRequestId(): string | undefined {
      return current?.requestId;
    },

    handleSpeak(request: TtsSpeakRequest): void {
      // Main sends one at a time, but a race during a reload could still overlap: settle the old
      // one first so Web Speech never has two utterances queued behind our back.
      if (current !== undefined && !settled) {
        options.environment.cancel();
        finish('interrupted', 'superseded by a newer utterance');
      }

      if (!options.environment.isSupported()) {
        options.report({
          requestId: request.requestId,
          status: 'unavailable',
          error: options.environment.unsupportedReason() ?? 'no local speech device',
        });
        return;
      }

      current = request;
      settled = false;

      options.environment.speak(request, {
        onEnd: () => finish('completed'),
        onError: (reason) => finish('error', reason),
      });
    },

    handleCancel(request: TtsCancelRequest): void {
      if (current === undefined) return;
      if (request.requestId !== undefined && request.requestId !== current.requestId) return;

      options.environment.cancel();
      // Reported immediately and marked settled: browsers differ on whether `cancel()` fires
      // `onend`, and Main must get exactly one answer either way.
      finish('interrupted', 'cancelled');
    },

    dispose(): void {
      if (current !== undefined && !settled) {
        options.environment.cancel();
        finish('interrupted', 'stage unloading');
      }
    },
  };
}
