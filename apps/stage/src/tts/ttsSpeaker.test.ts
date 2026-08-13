/**
 * STAGE speech device tests (Task 10 §6).
 *
 * The environment is faked so the whole adapter — including the "Web Speech is missing" path —
 * runs in Node without a browser. Exactly one acknowledgement per request is the core invariant:
 * Main advances its queue on that ack, so a double report would speak two utterances at once.
 */

import type { TtsSpeakRequest, TtsSpeakResult } from '@dance-arena/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { createWebSpeechEnvironment, type SpeechEnvironment } from './speechEnvironment.js';
import { createTtsSpeaker, type TtsSpeaker } from './ttsSpeaker.js';

interface FakeEnvironment extends SpeechEnvironment {
  readonly spoken: TtsSpeakRequest[];
  cancels: number;
  supported: boolean;
  end(): void;
  fail(reason: string): void;
}

function createFakeEnvironment(): FakeEnvironment {
  const spoken: TtsSpeakRequest[] = [];
  let handlers: { onEnd(): void; onError(reason: string): void } | undefined;

  const environment: FakeEnvironment = {
    spoken,
    cancels: 0,
    supported: true,

    isSupported: () => environment.supported,
    unsupportedReason: () => (environment.supported ? undefined : 'no speechSynthesis here'),

    speak(request, next) {
      spoken.push(request);
      handlers = next;
    },

    cancel() {
      environment.cancels += 1;
    },

    end() {
      handlers?.onEnd();
    },

    fail(reason) {
      handlers?.onError(reason);
    },
  };

  return environment;
}

const REQUEST: TtsSpeakRequest = {
  requestId: 'tts-1',
  text: 'Cảm ơn Mai đã follow!',
  lang: 'vi-VN',
  rate: 1,
  pitch: 1,
  volume: 1,
};

let environment: FakeEnvironment;
let results: TtsSpeakResult[];
let speaker: TtsSpeaker;

beforeEach(() => {
  environment = createFakeEnvironment();
  results = [];
  speaker = createTtsSpeaker({ environment, report: (result) => results.push(result) });
});

describe('speaking', () => {
  it('speaks the request and reports completion once', () => {
    speaker.handleSpeak(REQUEST);

    expect(environment.spoken).toEqual([REQUEST]);
    expect(results).toEqual([]);

    environment.end();

    expect(results).toEqual([{ requestId: 'tts-1', status: 'completed' }]);
  });

  it('ignores a late second `onend` for the same utterance', () => {
    speaker.handleSpeak(REQUEST);
    environment.end();
    environment.end();

    expect(results).toHaveLength(1);
  });

  it('ignores an `onerror` that arrives after completion', () => {
    speaker.handleSpeak(REQUEST);
    environment.end();
    environment.fail('too late');

    expect(results).toEqual([{ requestId: 'tts-1', status: 'completed' }]);
  });

  it('reports an error result', () => {
    speaker.handleSpeak(REQUEST);
    environment.fail('synthesis-failed');

    expect(results).toEqual([{ requestId: 'tts-1', status: 'error', error: 'synthesis-failed' }]);
  });

  it('exposes the request currently in flight', () => {
    expect(speaker.currentRequestId).toBeUndefined();

    speaker.handleSpeak(REQUEST);
    expect(speaker.currentRequestId).toBe('tts-1');

    environment.end();
    expect(speaker.currentRequestId).toBeUndefined();
  });
});

describe('cancellation', () => {
  it('cancels and reports interrupted exactly once', () => {
    speaker.handleSpeak(REQUEST);
    speaker.handleCancel({ requestId: 'tts-1' });

    expect(environment.cancels).toBe(1);
    expect(results).toEqual([{ requestId: 'tts-1', status: 'interrupted', error: 'cancelled' }]);

    // Browsers differ on whether `cancel()` also fires `onend`; either way Main gets one answer.
    environment.end();
    expect(results).toHaveLength(1);
  });

  it('cancels the current utterance when no id is given', () => {
    speaker.handleSpeak(REQUEST);
    speaker.handleCancel({});

    expect(results[0]?.status).toBe('interrupted');
  });

  it('ignores a cancel aimed at a different utterance', () => {
    speaker.handleSpeak(REQUEST);
    speaker.handleCancel({ requestId: 'tts-999' });

    expect(environment.cancels).toBe(0);
    expect(results).toEqual([]);
  });

  it('does nothing when nothing is being spoken', () => {
    speaker.handleCancel({});

    expect(environment.cancels).toBe(0);
    expect(results).toEqual([]);
  });
});

describe('unavailable speech device', () => {
  it('answers `unavailable` instead of throwing (§6 "fails gracefully")', () => {
    environment.supported = false;

    speaker.handleSpeak(REQUEST);

    expect(environment.spoken).toEqual([]);
    expect(results).toEqual([
      { requestId: 'tts-1', status: 'unavailable', error: 'no speechSynthesis here' },
    ]);
  });

  it('reports its own support state for the availability handshake', () => {
    environment.supported = false;

    expect(speaker.isSupported()).toBe(false);
    expect(speaker.unsupportedReason()).toBe('no speechSynthesis here');
  });
});

describe('overlap protection', () => {
  it('settles the previous utterance before starting a new one', () => {
    speaker.handleSpeak(REQUEST);
    speaker.handleSpeak({ ...REQUEST, requestId: 'tts-2' });

    expect(results[0]).toMatchObject({ requestId: 'tts-1', status: 'interrupted' });
    expect(speaker.currentRequestId).toBe('tts-2');
    expect(environment.cancels).toBe(1);
  });

  it('settles the utterance in flight on dispose', () => {
    speaker.handleSpeak(REQUEST);
    speaker.dispose();

    expect(results[0]).toMatchObject({ requestId: 'tts-1', status: 'interrupted' });
  });
});

describe('web speech environment probing', () => {
  it('reports unsupported when the renderer has no speechSynthesis', () => {
    const environment = createWebSpeechEnvironment({});

    expect(environment.isSupported()).toBe(false);
    expect(environment.unsupportedReason()).toContain('speechSynthesis');
  });

  it('reports unsupported when only half the API exists', () => {
    const halfBaked = createWebSpeechEnvironment({ speechSynthesis: { speak: () => undefined } });

    expect(halfBaked.isSupported()).toBe(false);
  });

  it('binds a complete API and forwards the voice settings', () => {
    const utterances: FakeUtterance[] = [];

    class FakeUtterance {
      lang = '';
      rate = 0;
      pitch = 0;
      volume = 0;
      onend: (() => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;

      constructor(public text: string) {
        utterances.push(this);
      }
    }

    const spoken: unknown[] = [];
    const environment = createWebSpeechEnvironment({
      speechSynthesis: {
        speak: (utterance: unknown) => spoken.push(utterance),
        cancel: () => undefined,
      },
      SpeechSynthesisUtterance: FakeUtterance,
    });

    expect(environment.isSupported()).toBe(true);

    let ended = false;
    environment.speak(
      { ...REQUEST, rate: 1.4, pitch: 0.8, volume: 0.5 },
      { onEnd: () => (ended = true), onError: () => undefined },
    );

    expect(spoken).toHaveLength(1);
    expect(utterances[0]).toMatchObject({
      text: REQUEST.text,
      lang: 'vi-VN',
      rate: 1.4,
      pitch: 0.8,
      volume: 0.5,
    });

    utterances[0]?.onend?.();
    expect(ended).toBe(true);
  });

  it('turns a throwing device into an error result rather than a crash', () => {
    class FakeUtterance {
      lang = '';
      rate = 0;
      pitch = 0;
      volume = 0;
      onend: (() => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      constructor(public text: string) {}
    }

    const environment = createWebSpeechEnvironment({
      speechSynthesis: {
        speak: () => {
          throw new Error('device is busy');
        },
        cancel: () => undefined,
      },
      SpeechSynthesisUtterance: FakeUtterance,
    });

    let reason: string | undefined;
    environment.speak(REQUEST, { onEnd: () => undefined, onError: (value) => (reason = value) });

    expect(reason).toBe('device is busy');
  });
});
