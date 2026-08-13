/**
 * Wires the STAGE speech device to the preload bridge (Task 10 §6, §7).
 *
 * STAGE announces whether Web Speech exists, then answers `autohost:tts-speak` /
 * `autohost:tts-cancel` with exactly one typed result per request. If Web Speech is missing the
 * availability report tells Main immediately, and every utterance is answered `unavailable` — the
 * visual half of Auto Host keeps working untouched (§6 "fails gracefully").
 */

import type { DanceArenaStageBridge } from '@dance-arena/contracts';

import { createWebSpeechEnvironment, type SpeechEnvironment } from './speechEnvironment.js';
import { createTtsSpeaker, type TtsSpeaker } from './ttsSpeaker.js';

export interface MountTtsOptions {
  readonly bridge: DanceArenaStageBridge;
  /** Injected in tests; production probes the renderer's own globals. */
  readonly environment?: SpeechEnvironment;
}

export interface MountedTts {
  readonly speaker: TtsSpeaker;
  destroy(): void;
}

export function mountTts(options: MountTtsOptions): MountedTts {
  const environment = options.environment ?? createWebSpeechEnvironment();
  const bridge = options.bridge;

  const speaker = createTtsSpeaker({
    environment,
    report: (result) => {
      void bridge.tts.reportResult(result).catch(() => undefined);
    },
  });

  const unsubscribes = [
    bridge.tts.onSpeak((request) => speaker.handleSpeak(request)),
    bridge.tts.onCancel((request) => speaker.handleCancel(request)),
  ];

  const reason = speaker.unsupportedReason();
  void bridge.tts
    .reportAvailability({
      available: speaker.isSupported(),
      ...(reason === undefined ? {} : { detail: reason }),
    })
    .catch(() => undefined);

  return {
    speaker,
    destroy(): void {
      for (const unsubscribe of unsubscribes) unsubscribe();
      speaker.dispose();
    },
  };
}
