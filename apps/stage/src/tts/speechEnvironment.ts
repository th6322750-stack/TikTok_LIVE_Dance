/**
 * Web Speech environment port (Task 10 §6).
 *
 * The whole browser speech API is hidden behind three methods, which is what lets the speaker be
 * tested in jsdom — where `speechSynthesis` does not exist — through the same code path it uses in
 * production.
 *
 * There is no credential anywhere in this file: Task 10 ships the local, no-account path only.
 */

import type { TtsSpeakRequest } from '@dance-arena/contracts';

export interface SpeechHandlers {
  onEnd(): void;
  onError(reason: string): void;
}

export interface SpeechEnvironment {
  isSupported(): boolean;
  /** Reason shown in CONTROL when unsupported, e.g. `speechSynthesis is not available`. */
  unsupportedReason(): string | undefined;
  speak(request: TtsSpeakRequest, handlers: SpeechHandlers): void;
  cancel(): void;
}

/** The slice of `SpeechSynthesisUtterance` this adapter sets. */
interface UtteranceLike {
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

interface SynthesisLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
}

interface SpeechGlobals {
  readonly speechSynthesis?: SynthesisLike;
  readonly SpeechSynthesisUtterance?: new (text: string) => UtteranceLike;
}

/**
 * Binds the real browser API.
 *
 * Both `speechSynthesis` and `SpeechSynthesisUtterance` must exist: some embedded runtimes expose
 * one without the other, and calling into that combination throws instead of failing gracefully.
 */
export function createWebSpeechEnvironment(scope: unknown = globalThis): SpeechEnvironment {
  // `scope` is an ambient capability that may simply not be there, so it is probed rather than
  // typed: every use below re-checks the shape before calling into it.
  const globals = scope as SpeechGlobals;

  const synthesis = (): SynthesisLike | undefined =>
    typeof globals.speechSynthesis === 'object' ? globals.speechSynthesis : undefined;

  const Utterance = (): (new (text: string) => UtteranceLike) | undefined =>
    typeof globals.SpeechSynthesisUtterance === 'function'
      ? globals.SpeechSynthesisUtterance
      : undefined;

  const supported = (): boolean => synthesis() !== undefined && Utterance() !== undefined;

  return {
    isSupported: supported,

    unsupportedReason: (): string | undefined =>
      supported() ? undefined : 'Web Speech (speechSynthesis) is not available in this renderer',

    speak(request: TtsSpeakRequest, handlers: SpeechHandlers): void {
      const device = synthesis();
      const Constructor = Utterance();

      if (device === undefined || Constructor === undefined) {
        handlers.onError('speechSynthesis is not available');
        return;
      }

      try {
        const utterance = new Constructor(request.text);
        utterance.lang = request.lang;
        utterance.rate = request.rate;
        utterance.pitch = request.pitch;
        utterance.volume = request.volume;
        utterance.onend = () => handlers.onEnd();
        utterance.onerror = (event) => handlers.onError(event.error ?? 'speech error');

        device.speak(utterance);
      } catch (error) {
        handlers.onError(error instanceof Error ? error.message : 'speech failed');
      }
    },

    cancel(): void {
      synthesis()?.cancel();
    },
  };
}
