/**
 * Main-owned TTS queue tests (Task 10 §11 "TTS queue").
 *
 * The provider is a controllable fake: `speak()` returns a promise a test resolves by hand, which
 * is how "no overlapping speak calls" and "provider error continues without deadlock" are asserted
 * without any real timing.
 */

import type {
  TtsPriority,
  TtsQueuePolicy,
  TtsSpeakRequest,
  TtsSpeakResult,
  TtsVoiceSettings,
} from '@dance-arena/contracts';
import { createFixedClock, createSequentialIdGenerator } from '@dance-arena/core-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createTtsQueueService,
  type TtsDropReason,
  type TtsProvider,
  type TtsQueueService,
} from './ttsQueue.js';

const POLICY: TtsQueuePolicy = {
  maxQueued: 5,
  maxTextLength: 180,
  duplicateWindowMs: 8_000,
  ttlMs: { critical: 30_000, high: 25_000, normal: 20_000, low: 15_000 },
  interruptPolicy: 'never',
  maxRetries: 1,
};

const VOICE: TtsVoiceSettings = { enabled: true, lang: 'vi-VN', rate: 1, pitch: 1, volume: 1 };

interface FakeProvider extends TtsProvider {
  readonly spoken: TtsSpeakRequest[];
  readonly cancelled: (string | undefined)[];
  /** How many `speak()` calls are still awaiting a result. */
  readonly inFlight: number;
  settle(status: TtsSpeakResult['status']): Promise<void>;
  available: boolean;
  supportsCancel: boolean;
}

function createFakeProvider(): FakeProvider {
  const spoken: TtsSpeakRequest[] = [];
  const cancelled: (string | undefined)[] = [];
  const pending: { requestId: string; resolve: (result: TtsSpeakResult) => void }[] = [];

  const provider: FakeProvider = {
    spoken,
    cancelled,
    available: true,
    supportsCancel: true,

    get inFlight(): number {
      return pending.length;
    },

    isAvailable: () => provider.available,

    speak(request: TtsSpeakRequest): Promise<TtsSpeakResult> {
      spoken.push(request);

      if (!provider.available) {
        return Promise.resolve({ requestId: request.requestId, status: 'unavailable' });
      }

      return new Promise<TtsSpeakResult>((resolve) => {
        pending.push({ requestId: request.requestId, resolve });
      });
    },

    cancel(requestId?: string): void {
      if (!provider.supportsCancel) return;
      cancelled.push(requestId);
    },

    async settle(status: TtsSpeakResult['status']): Promise<void> {
      const next = pending.shift();
      if (next === undefined) return;

      next.resolve({ requestId: next.requestId, status });
      // Let the queue's `.then` chain run.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };

  return provider;
}

let clock: ReturnType<typeof createFixedClock>;
let provider: FakeProvider;
let drops: { reason: TtsDropReason; requestId: string }[];

function createService(policy: TtsQueuePolicy = POLICY, voice = VOICE): TtsQueueService {
  return createTtsQueueService({
    clock,
    ids: createSequentialIdGenerator(),
    provider,
    policy,
    voice,
    onDrop: (reason, item) => drops.push({ reason, requestId: item.requestId }),
  });
}

function enqueue(
  service: TtsQueueService,
  text: string,
  priority: TtsPriority = 'normal',
  ruleId = 'rule',
  userId = 'user-1',
): ReturnType<TtsQueueService['enqueue']> {
  return service.enqueue({
    ruleId,
    text,
    priority,
    userId,
    dedupKey: `${ruleId}|${userId}|${text.toLowerCase()}`,
  });
}

beforeEach(() => {
  clock = createFixedClock(1_000);
  provider = createFakeProvider();
  drops = [];
});

describe('priority and ordering', () => {
  it('speaks the highest priority first', async () => {
    const service = createService();

    enqueue(service, 'low one', 'low');
    enqueue(service, 'critical one', 'critical');
    enqueue(service, 'normal one', 'normal');

    // The first item started speaking immediately; the rest are ordered behind it.
    expect(provider.spoken[0]?.text).toBe('low one');
    await provider.settle('completed');
    expect(provider.spoken[1]?.text).toBe('critical one');
    await provider.settle('completed');
    expect(provider.spoken[2]?.text).toBe('normal one');
  });

  it('keeps FIFO order within one priority', async () => {
    const service = createService();

    enqueue(service, 'first', 'normal');
    await provider.settle('completed');

    enqueue(service, 'a', 'normal', 'rule', 'user-a');
    enqueue(service, 'b', 'normal', 'rule', 'user-b');
    enqueue(service, 'c', 'normal', 'rule', 'user-c');

    expect(provider.spoken[1]?.text).toBe('a');
    await provider.settle('completed');
    expect(provider.spoken[2]?.text).toBe('b');
    await provider.settle('completed');
    expect(provider.spoken[3]?.text).toBe('c');
  });

  it('never calls speak twice before a result arrives', () => {
    const service = createService();

    enqueue(service, 'one');
    enqueue(service, 'two', 'critical');
    enqueue(service, 'three', 'critical');

    expect(provider.spoken).toHaveLength(1);
    expect(provider.inFlight).toBe(1);
  });
});

describe('duplicate suppression', () => {
  it('suppresses an identical utterance inside the window', () => {
    const service = createService();

    expect(enqueue(service, 'cảm ơn A')).toBe('queued');
    expect(enqueue(service, 'cảm ơn A')).toBe('suppressed');
    expect(service.getMetrics().suppressed).toBe(1);
  });

  it('allows it again once the window elapsed', () => {
    const service = createService();

    enqueue(service, 'cảm ơn A');
    clock.advance(POLICY.duplicateWindowMs + 1);

    expect(enqueue(service, 'cảm ơn A')).toBe('queued');
  });

  it('never merges two different users saying the same thing', () => {
    const service = createService();

    expect(enqueue(service, 'thanks', 'normal', 'rule', 'user-a')).toBe('queued');
    expect(enqueue(service, 'thanks', 'normal', 'rule', 'user-b')).toBe('queued');
    expect(service.getMetrics().suppressed).toBe(0);
  });

  it('never merges two different rules', () => {
    const service = createService();

    expect(enqueue(service, 'thanks', 'normal', 'rule-a')).toBe('queued');
    expect(enqueue(service, 'thanks', 'normal', 'rule-b')).toBe('queued');
    expect(service.getMetrics().suppressed).toBe(0);
  });
});

describe('bounds', () => {
  it('stays bounded under a 100+ event burst', () => {
    const service = createService();

    for (let index = 0; index < 150; index += 1) {
      enqueue(service, `utterance ${index}`, 'normal', 'rule', `user-${index}`);
    }

    expect(service.pendingCount).toBeLessThanOrEqual(POLICY.maxQueued);
    expect(service.getMetrics().dropped).toBeGreaterThan(0);
  });

  it('drops the least important, newest item when full', () => {
    const service = createService({ ...POLICY, maxQueued: 2 });

    enqueue(service, 'speaking', 'normal', 'rule', 'user-0');
    enqueue(service, 'keep-high', 'high', 'rule', 'user-1');
    enqueue(service, 'keep-normal', 'normal', 'rule', 'user-2');

    // Queue is full (high + normal). A newly arriving LOW item is the least important → dropped.
    expect(enqueue(service, 'drop-me', 'low', 'rule', 'user-3')).toBe('dropped');
    expect(service.getPending().map((item) => item.text)).toEqual(['keep-high', 'keep-normal']);

    // A CRITICAL item outranks the queued normal one, which is evicted instead.
    expect(enqueue(service, 'critical', 'critical', 'rule', 'user-4')).toBe('queued');
    expect(service.getPending().map((item) => item.text)).toEqual(['critical', 'keep-high']);
    expect(drops.some((drop) => drop.reason === 'queue-full')).toBe(true);
  });

  it('truncates text beyond the spoken limit', () => {
    const service = createService({ ...POLICY, maxTextLength: 20 });

    enqueue(service, 'x'.repeat(100));

    expect(provider.spoken[0]?.text.length).toBe(20);
  });

  it('rejects empty text', () => {
    expect(enqueue(createService(), '   ')).toBe('empty');
  });
});

describe('stale TTL', () => {
  it('drops an item that outlived its TTL instead of speaking it late', async () => {
    const service = createService();

    enqueue(service, 'speaking now', 'normal', 'rule', 'user-0');
    enqueue(service, 'too old by the time we get here', 'low', 'rule', 'user-1');

    clock.advance(POLICY.ttlMs.low + 1);
    await provider.settle('completed');

    expect(provider.spoken.map((request) => request.text)).toEqual(['speaking now']);
    expect(service.getMetrics().expired).toBe(1);
    expect(service.pendingCount).toBe(0);
  });

  it('sweeps expired items on tick even when nothing else happens', () => {
    const service = createService();

    enqueue(service, 'speaking', 'normal', 'rule', 'user-0');
    enqueue(service, 'stale', 'low', 'rule', 'user-1');

    clock.advance(POLICY.ttlMs.low + 1);
    service.tick(clock.now());

    expect(service.pendingCount).toBe(0);
    expect(drops.some((drop) => drop.reason === 'expired')).toBe(true);
  });

  it('gives a critical utterance a longer life than a low one', () => {
    const service = createService();

    enqueue(service, 'speaking', 'normal', 'rule', 'user-0');
    enqueue(service, 'critical', 'critical', 'rule', 'user-1');
    enqueue(service, 'low', 'low', 'rule', 'user-2');

    const pending = service.getPending();
    const critical = pending.find((item) => item.priority === 'critical');
    const low = pending.find((item) => item.priority === 'low');

    expect((critical?.expiresAt ?? 0) - (low?.expiresAt ?? 0)).toBe(
      POLICY.ttlMs.critical - POLICY.ttlMs.low,
    );
  });
});

describe('provider failures', () => {
  it('continues to the next item after an error', async () => {
    const service = createService();

    enqueue(service, 'boom', 'normal', 'rule', 'user-0');
    enqueue(service, 'next', 'normal', 'rule', 'user-1');

    await provider.settle('error');

    expect(service.getMetrics().errors).toBe(1);
    expect(provider.spoken[1]?.text).toBe('next');
  });

  it('drains without deadlock when no speech device exists', async () => {
    provider.available = false;
    const service = createService();

    enqueue(service, 'one', 'normal', 'rule', 'user-0');
    enqueue(service, 'two', 'normal', 'rule', 'user-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.getMetrics().unavailable).toBeGreaterThan(0);
    expect(service.pendingCount).toBe(0);
  });
});

describe('interruption and retries', () => {
  it('retries an interrupted utterance at most `maxRetries` times', async () => {
    const service = createService({ ...POLICY, maxRetries: 1 });

    enqueue(service, 'interrupt me');
    expect(provider.spoken).toHaveLength(1);

    await provider.settle('interrupted');
    expect(provider.spoken).toHaveLength(2);

    // Second interruption exhausts the retry budget: the item is dropped, not replayed forever.
    await provider.settle('interrupted');
    expect(provider.spoken).toHaveLength(2);
    expect(service.pendingCount).toBe(0);
    expect(drops.some((drop) => drop.reason === 'retries-exhausted')).toBe(true);
  });

  it('does not retry an interrupted utterance that is already stale', async () => {
    const service = createService();

    enqueue(service, 'stale on return', 'low');
    clock.advance(POLICY.ttlMs.low + 1);
    await provider.settle('interrupted');

    expect(provider.spoken).toHaveLength(1);
    expect(service.pendingCount).toBe(0);
  });

  it('does not interrupt under the `never` policy', () => {
    const service = createService({ ...POLICY, interruptPolicy: 'never' });

    enqueue(service, 'low speaking', 'low', 'rule', 'user-0');
    enqueue(service, 'critical arrives', 'critical', 'rule', 'user-1');

    expect(provider.cancelled).toEqual([]);
  });

  it('interrupts a lower-priority utterance under `lower-priority-only`', () => {
    const service = createService({ ...POLICY, interruptPolicy: 'lower-priority-only' });

    enqueue(service, 'low speaking', 'low', 'rule', 'user-0');
    const speaking = service.getCurrent();

    enqueue(service, 'critical arrives', 'critical', 'rule', 'user-1');

    expect(provider.cancelled).toEqual([speaking?.requestId]);
  });

  it('does not interrupt for an equal or lower priority', () => {
    const service = createService({ ...POLICY, interruptPolicy: 'lower-priority-only' });

    enqueue(service, 'high speaking', 'high', 'rule', 'user-0');
    enqueue(service, 'also high', 'high', 'rule', 'user-1');
    enqueue(service, 'low', 'low', 'rule', 'user-2');

    expect(provider.cancelled).toEqual([]);
  });

  it('degrades to `never` when the device cannot cancel', () => {
    provider.supportsCancel = false;
    const noCancel: TtsProvider = {
      isAvailable: () => provider.isAvailable(),
      speak: (request) => provider.speak(request),
    };

    const service = createTtsQueueService({
      clock,
      ids: createSequentialIdGenerator(),
      provider: noCancel,
      policy: { ...POLICY, interruptPolicy: 'lower-priority-only' },
      voice: VOICE,
    });

    enqueue(service, 'low speaking', 'low', 'rule', 'user-0');
    enqueue(service, 'critical arrives', 'critical', 'rule', 'user-1');

    expect(provider.cancelled).toEqual([]);
    expect(service.pendingCount).toBe(1);
  });
});

describe('clear and toggles', () => {
  it('drops everything pending and cancels the utterance in flight', () => {
    const service = createService();

    enqueue(service, 'speaking', 'normal', 'rule', 'user-0');
    enqueue(service, 'queued', 'normal', 'rule', 'user-1');

    service.clear();

    expect(service.pendingCount).toBe(0);
    expect(provider.cancelled).toHaveLength(1);
    expect(drops.some((drop) => drop.reason === 'cleared')).toBe(true);
  });

  it('does not resurrect a cleared utterance when its interrupted result arrives', async () => {
    const service = createService();

    enqueue(service, 'speaking');
    service.clear();
    await provider.settle('interrupted');

    expect(service.pendingCount).toBe(0);
    expect(provider.spoken).toHaveLength(1);
  });

  it('refuses to enqueue while TTS is disabled', () => {
    const service = createService(POLICY, { ...VOICE, enabled: false });

    expect(enqueue(service, 'nope')).toBe('disabled');
    expect(provider.spoken).toEqual([]);
  });

  it('stops immediately when TTS is switched off', () => {
    const service = createService();

    enqueue(service, 'speaking', 'normal', 'rule', 'user-0');
    enqueue(service, 'queued', 'normal', 'rule', 'user-1');

    service.setVoice({ ...VOICE, enabled: false });

    expect(service.pendingCount).toBe(0);
    expect(provider.cancelled).toHaveLength(1);
  });

  it('resumes speaking when TTS is switched back on', async () => {
    const service = createService(POLICY, { ...VOICE, enabled: false });

    expect(enqueue(service, 'nope')).toBe('disabled');

    service.setVoice(VOICE);
    expect(enqueue(service, 'now allowed')).toBe('queued');
    expect(provider.spoken[0]?.text).toBe('now allowed');
    await provider.settle('completed');
  });

  it('applies the current voice settings to every request', () => {
    const service = createService(POLICY, { ...VOICE, rate: 1.4, pitch: 0.8, volume: 0.5 });

    enqueue(service, 'hello');

    expect(provider.spoken[0]).toMatchObject({
      lang: 'vi-VN',
      rate: 1.4,
      pitch: 0.8,
      volume: 0.5,
    });
  });
});

describe('metrics', () => {
  it('counts what happened to every utterance', async () => {
    const service = createService();

    enqueue(service, 'one', 'normal', 'rule', 'user-0');
    await provider.settle('completed');
    enqueue(service, 'one', 'normal', 'rule', 'user-0');

    expect(service.getMetrics()).toMatchObject({ enqueued: 1, spoken: 1, suppressed: 1 });
  });
});
