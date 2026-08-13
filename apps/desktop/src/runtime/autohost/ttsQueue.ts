/**
 * Main-owned TTS queue (Blueprint §51, Task 10 §6).
 *
 * The canonical queue lives HERE — not in CONTROL, not in STAGE. A CONTROL reload cannot clear it
 * and a STAGE reload can only interrupt the utterance currently in flight. STAGE is a speech
 * device behind the `TtsProvider` port; this service decides what is spoken and when.
 *
 * Invariants
 * - One utterance at a time. `speak()` is never called again before the previous result arrives.
 * - Bounded: at most `maxQueued` items. A burst evicts deterministically (least important, then
 *   newest) and increments `dropped` instead of growing.
 * - Priority with stable FIFO inside a priority, using a monotonic sequence number.
 * - Duplicate suppression keyed on rule + canonical user + normalized text, so two different
 *   viewers are never collapsed into one thank-you.
 * - Every item carries a TTL, so a queue that could not drain drops stale work rather than
 *   speaking a thank-you minutes after the gift.
 * - An interrupted utterance is retried at most `maxRetries` times; there is no unbounded replay.
 */

import type {
  TtsAvailability,
  TtsPriority,
  TtsQueueItemView,
  TtsQueueMetrics,
  TtsQueuePolicy,
  TtsSpeakRequest,
  TtsSpeakResult,
  TtsVoiceSettings,
} from '@dance-arena/contracts';
import { TTS_PRIORITY_RANK } from '@dance-arena/contracts';
import type { Clock, IdGenerator } from '@dance-arena/core-engine';

/**
 * Speech output port (Task 10 §6 "Required provider abstraction").
 *
 * No implementation of this interface may take a credential: Task 10 ships the local, no-account
 * Web Speech path only.
 */
export interface TtsProvider {
  speak(request: TtsSpeakRequest): Promise<TtsSpeakResult>;
  cancel?(requestId?: string): Promise<void> | void;
  isAvailable(): boolean;
  /** Optional detail for CONTROL, e.g. "speechSynthesis missing". Never a provider payload. */
  getAvailability?(): TtsAvailability;
}

export interface TtsQueueItem {
  readonly ruleId: string;
  readonly text: string;
  readonly priority: TtsPriority;
  readonly userId?: string;
  /** Stable suppression key produced by the rule engine. */
  readonly dedupKey: string;
}

export type TtsEnqueueOutcome = 'queued' | 'suppressed' | 'dropped' | 'disabled' | 'empty';

export const TTS_DROP_REASONS = [
  'queue-full',
  'expired',
  'cleared',
  'unavailable',
  'error',
  'retries-exhausted',
] as const;

export type TtsDropReason = (typeof TTS_DROP_REASONS)[number];

export interface TtsQueueServiceOptions {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly provider: TtsProvider;
  readonly policy: TtsQueuePolicy;
  readonly voice: TtsVoiceSettings;
  /** Called whenever queue state or metrics changed, so status publishing can be throttled. */
  readonly onChange?: () => void;
  /** Diagnostics sink for dropped work; never receives provider payloads. */
  readonly onDrop?: (reason: TtsDropReason, item: TtsQueueItemView) => void;
}

export interface TtsQueueService {
  enqueue(item: TtsQueueItem): TtsEnqueueOutcome;
  /** Drops everything pending and cancels the utterance in flight. */
  clear(): void;
  /** Prunes expired items and starts the next utterance if the device is idle. */
  tick(now: number): void;
  setPolicy(policy: TtsQueuePolicy): void;
  setVoice(voice: TtsVoiceSettings): void;
  setProvider(provider: TtsProvider): void;
  getMetrics(): TtsQueueMetrics;
  getPending(): TtsQueueItemView[];
  getCurrent(): TtsQueueItemView | undefined;
  readonly pendingCount: number;
  dispose(): void;
}

interface QueuedUtterance {
  readonly requestId: string;
  readonly ruleId: string;
  readonly userId: string | undefined;
  readonly text: string;
  readonly priority: TtsPriority;
  readonly dedupKey: string;
  readonly enqueuedAt: number;
  readonly expiresAt: number;
  /** Monotonic insertion order — the FIFO tie-break inside one priority. */
  readonly seq: number;
  attempts: number;
}

function viewOf(item: QueuedUtterance): TtsQueueItemView {
  return {
    requestId: item.requestId,
    ruleId: item.ruleId,
    priority: item.priority,
    text: item.text,
    enqueuedAt: item.enqueuedAt,
    expiresAt: item.expiresAt,
  };
}

/** Most important first: priority rank ascending, then insertion order ascending. */
function compare(left: QueuedUtterance, right: QueuedUtterance): number {
  const byPriority = TTS_PRIORITY_RANK[left.priority] - TTS_PRIORITY_RANK[right.priority];
  return byPriority !== 0 ? byPriority : left.seq - right.seq;
}

function emptyMetrics(): TtsQueueMetrics {
  return {
    enqueued: 0,
    spoken: 0,
    suppressed: 0,
    dropped: 0,
    expired: 0,
    unavailable: 0,
    errors: 0,
    interrupted: 0,
  };
}

export function createTtsQueueService(options: TtsQueueServiceOptions): TtsQueueService {
  let policy = options.policy;
  let voice = options.voice;
  let provider = options.provider;

  const queue: QueuedUtterance[] = [];
  /** `dedupKey -> last accepted at`, pruned against the duplicate window. */
  const recent = new Map<string, number>();

  let metrics = emptyMetrics();
  let speaking: QueuedUtterance | undefined;
  let nextSeq = 0;
  /**
   * Bumped by `clear()` and by provider swaps. A result carrying a stale generation is accounted
   * for but never re-queued, which is what stops a cleared item from coming back.
   */
  let generation = 0;
  let disposed = false;

  const changed = (): void => options.onChange?.();

  const drop = (item: QueuedUtterance, reason: TtsDropReason): void => {
    options.onDrop?.(reason, viewOf(item));
  };

  function pruneRecent(now: number): void {
    for (const [key, at] of recent) {
      if (now - at >= policy.duplicateWindowMs) recent.delete(key);
    }
  }

  function pruneExpired(now: number): void {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const item = queue[index];
      if (item === undefined || now < item.expiresAt) continue;

      queue.splice(index, 1);
      metrics = { ...metrics, expired: metrics.expired + 1 };
      drop(item, 'expired');
    }
  }

  /** Least important, newest — the deterministic eviction candidate when the queue is full. */
  function worstIndex(): number {
    let worst = 0;
    for (let index = 1; index < queue.length; index += 1) {
      const candidate = queue[index];
      const current = queue[worst];
      if (candidate === undefined || current === undefined) continue;
      if (compare(candidate, current) > 0) worst = index;
    }
    return worst;
  }

  function takeNext(): QueuedUtterance | undefined {
    if (queue.length === 0) return undefined;

    let best = 0;
    for (let index = 1; index < queue.length; index += 1) {
      const candidate = queue[index];
      const current = queue[best];
      if (candidate === undefined || current === undefined) continue;
      if (compare(candidate, current) < 0) best = index;
    }

    return queue.splice(best, 1)[0];
  }

  function settle(item: QueuedUtterance, atGeneration: number, result: TtsSpeakResult): void {
    speaking = undefined;

    switch (result.status) {
      case 'completed':
        metrics = { ...metrics, spoken: metrics.spoken + 1 };
        break;

      case 'unavailable':
        metrics = { ...metrics, unavailable: metrics.unavailable + 1 };
        drop(item, 'unavailable');
        break;

      case 'error':
        metrics = { ...metrics, errors: metrics.errors + 1 };
        drop(item, 'error');
        break;

      case 'interrupted': {
        metrics = { ...metrics, interrupted: metrics.interrupted + 1 };

        // A STAGE reload interrupts the utterance in flight. Retry it at most `maxRetries` times
        // and only while it is still within its TTL; otherwise drop it with a reason. The queue
        // therefore never replays indefinitely and never grows (§6 "Reload/disconnect").
        const now = options.clock.now();
        const retryable =
          atGeneration === generation && item.attempts <= policy.maxRetries && now < item.expiresAt;

        if (retryable) queue.push(item);
        else {
          metrics = { ...metrics, dropped: metrics.dropped + 1 };
          drop(item, 'retries-exhausted');
        }
        break;
      }
    }

    changed();
    pump();
  }

  function pump(): void {
    if (disposed || speaking !== undefined) return;
    if (!voice.enabled) return;

    const now = options.clock.now();
    pruneExpired(now);

    const next = takeNext();
    if (next === undefined) return;

    next.attempts += 1;
    speaking = next;

    const request: TtsSpeakRequest = {
      requestId: next.requestId,
      // Bound again at the speaking boundary: the producer's limit and the consumer's limit are
      // enforced independently.
      text: next.text.slice(0, policy.maxTextLength),
      lang: voice.lang,
      rate: voice.rate,
      pitch: voice.pitch,
      volume: voice.volume,
    };

    const atGeneration = generation;
    changed();

    void Promise.resolve(provider.speak(request)).then(
      (result) => settle(next, atGeneration, result),
      (error: unknown) =>
        settle(next, atGeneration, {
          requestId: next.requestId,
          status: 'error',
          error: error instanceof Error ? error.message.slice(0, 200) : 'tts provider failure',
        }),
    );
  }

  function clearQueue(): void {
    generation += 1;

    const cleared = queue.splice(0, queue.length);
    for (const item of cleared) drop(item, 'cleared');
    metrics = { ...metrics, dropped: metrics.dropped + cleared.length };

    recent.clear();

    const current = speaking;
    if (current !== undefined && provider.cancel !== undefined) {
      void Promise.resolve(provider.cancel(current.requestId)).catch(() => undefined);
    }

    changed();
  }

  /** Cancels the utterance in flight when the policy allows and the device supports it. */
  function maybeInterruptFor(candidate: QueuedUtterance): void {
    const current = speaking;
    if (current === undefined) return;
    if (policy.interruptPolicy !== 'lower-priority-only') return;

    // Degrade to `never` rather than corrupt state when the device cannot cancel cleanly.
    if (provider.cancel === undefined) return;

    if (TTS_PRIORITY_RANK[candidate.priority] >= TTS_PRIORITY_RANK[current.priority]) return;

    void Promise.resolve(provider.cancel(current.requestId)).catch(() => undefined);
  }

  return {
    enqueue(item: TtsQueueItem): TtsEnqueueOutcome {
      if (disposed) return 'disabled';
      if (!voice.enabled) return 'disabled';

      const text = item.text.trim();
      if (text.length === 0) return 'empty';

      const now = options.clock.now();
      pruneRecent(now);

      const lastSeen = recent.get(item.dedupKey);
      if (lastSeen !== undefined && now - lastSeen < policy.duplicateWindowMs) {
        metrics = { ...metrics, suppressed: metrics.suppressed + 1 };
        changed();
        return 'suppressed';
      }

      const candidate: QueuedUtterance = {
        requestId: options.ids.next('tts'),
        ruleId: item.ruleId,
        userId: item.userId,
        text: text.slice(0, policy.maxTextLength),
        priority: item.priority,
        dedupKey: item.dedupKey,
        enqueuedAt: now,
        expiresAt: now + policy.ttlMs[item.priority],
        seq: nextSeq++,
        attempts: 0,
      };

      pruneExpired(now);

      if (queue.length >= policy.maxQueued) {
        const worst = worstIndex();
        const evicted = queue[worst];

        // Deterministic policy: the least important, newest item loses — including the arriving
        // one when it is itself the least important.
        if (evicted !== undefined && compare(candidate, evicted) >= 0) {
          metrics = { ...metrics, dropped: metrics.dropped + 1 };
          drop(candidate, 'queue-full');
          changed();
          return 'dropped';
        }

        if (evicted !== undefined) {
          queue.splice(worst, 1);
          metrics = { ...metrics, dropped: metrics.dropped + 1 };
          drop(evicted, 'queue-full');
        }
      }

      recent.set(item.dedupKey, now);
      queue.push(candidate);
      metrics = { ...metrics, enqueued: metrics.enqueued + 1 };

      maybeInterruptFor(candidate);
      changed();
      pump();

      return 'queued';
    },

    clear: clearQueue,

    tick(now: number): void {
      if (disposed) return;

      pruneRecent(now);
      pruneExpired(now);
      pump();
    },

    setPolicy(next: TtsQueuePolicy): void {
      policy = next;
      changed();
    },

    setVoice(next: TtsVoiceSettings): void {
      const wasEnabled = voice.enabled;
      voice = next;

      // Turning TTS off must stop speech now, not after the backlog drains.
      if (wasEnabled && !next.enabled) clearQueue();
      else if (!wasEnabled && next.enabled) pump();

      changed();
    },

    setProvider(next: TtsProvider): void {
      generation += 1;
      provider = next;
      changed();
      pump();
    },

    getMetrics: () => metrics,

    getPending: (): TtsQueueItemView[] => [...queue].sort(compare).map(viewOf),

    getCurrent: (): TtsQueueItemView | undefined =>
      speaking === undefined ? undefined : viewOf(speaking),

    get pendingCount(): number {
      return queue.length;
    },

    dispose(): void {
      disposed = true;
      generation += 1;
      queue.splice(0, queue.length);
      recent.clear();
    },
  };
}
