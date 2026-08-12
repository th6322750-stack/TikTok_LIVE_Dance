/**
 * AvatarCache (Blueprint §31, §34).
 *
 * Pipeline: remote image → cache → texture → circle mask.
 *
 *   memory (fast, bounded LRU) → disk store (survives restarts) → fetch → default avatar
 *
 * Key is `hash(url)`, TTL is configurable (Blueprint §34 suggests 24–72h). A network failure NEVER
 * propagates: it resolves to the theme's fallback avatar so a dancer is never headless.
 *
 * Storage, hashing, fetching and time are all ports, so this file has no Node/DOM dependency and
 * the whole cache is testable with virtual time.
 */

export interface AvatarBlob {
  /** Raw image bytes. */
  readonly bytes: Uint8Array;
  readonly mime: string;
}

export interface CachedAvatar extends AvatarBlob {
  readonly url: string;
  readonly key: string;
  readonly storedAt: number;
  readonly source: 'memory' | 'disk' | 'network' | 'fallback';
}

/** Persistent backend. Main provides a filesystem implementation; tests use an in-memory one. */
export interface AvatarBlobStore {
  read(key: string): Promise<{ blob: AvatarBlob; storedAt: number } | undefined>;
  write(key: string, blob: AvatarBlob, storedAt: number): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface AvatarCacheOptions {
  readonly clock: { now(): number };
  /** Stable hash of the url; injected so the caller picks the algorithm. */
  readonly hash: (input: string) => string;
  readonly fetchAvatar: (url: string) => Promise<AvatarBlob>;
  readonly diskStore?: AvatarBlobStore;
  /** Entry lifetime in ms. Default 48h, inside the 24–72h band of Blueprint §34. */
  readonly ttlMs?: number;
  /** Max entries kept in memory (LRU). */
  readonly memoryCapacity?: number;
}

export interface AvatarCacheStats {
  readonly memoryHits: number;
  readonly diskHits: number;
  readonly networkLoads: number;
  readonly failures: number;
  readonly expired: number;
  readonly memorySize: number;
}

export interface AvatarCache {
  /** Returns the avatar bytes, or undefined when it could not be obtained (caller uses fallback). */
  get(url: string | undefined): Promise<CachedAvatar | undefined>;
  invalidate(url: string): Promise<void>;
  /** Drops expired entries from memory and disk. */
  prune(): Promise<number>;
  clear(): Promise<void>;
  readonly stats: AvatarCacheStats;
}

const DEFAULT_TTL_MS = 48 * 60 * 60_000;
const DEFAULT_MEMORY_CAPACITY = 200;

interface MemoryEntry {
  readonly blob: AvatarBlob;
  readonly storedAt: number;
}

export function createAvatarCache(options: AvatarCacheOptions): AvatarCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const capacity = options.memoryCapacity ?? DEFAULT_MEMORY_CAPACITY;

  /** Insertion-ordered so the first key is the least recently used. */
  const memory = new Map<string, MemoryEntry>();
  /** De-duplicates concurrent requests for the same avatar into one network load. */
  const inFlight = new Map<string, Promise<CachedAvatar | undefined>>();

  let memoryHits = 0;
  let diskHits = 0;
  let networkLoads = 0;
  let failures = 0;
  let expired = 0;

  const isFresh = (storedAt: number): boolean => options.clock.now() - storedAt < ttlMs;

  function remember(key: string, entry: MemoryEntry): void {
    memory.delete(key);
    memory.set(key, entry);

    while (memory.size > capacity) {
      const oldest = memory.keys().next();
      if (oldest.done === true) break;
      memory.delete(oldest.value);
    }
  }

  async function load(url: string, key: string): Promise<CachedAvatar | undefined> {
    const cached = memory.get(key);
    if (cached !== undefined) {
      if (isFresh(cached.storedAt)) {
        memoryHits += 1;
        remember(key, cached); // refresh LRU position
        return { ...cached.blob, url, key, storedAt: cached.storedAt, source: 'memory' };
      }

      expired += 1;
      memory.delete(key);
    }

    const stored = await options.diskStore?.read(key);
    if (stored !== undefined) {
      if (isFresh(stored.storedAt)) {
        diskHits += 1;
        remember(key, { blob: stored.blob, storedAt: stored.storedAt });
        return { ...stored.blob, url, key, storedAt: stored.storedAt, source: 'disk' };
      }

      expired += 1;
      await options.diskStore?.delete(key);
    }

    try {
      const blob = await options.fetchAvatar(url);
      const storedAt = options.clock.now();

      networkLoads += 1;
      remember(key, { blob, storedAt });
      await options.diskStore?.write(key, blob, storedAt);

      return { ...blob, url, key, storedAt, source: 'network' };
    } catch {
      // A dead avatar url is routine on TikTok; the caller falls back to the default avatar.
      failures += 1;
      return undefined;
    }
  }

  return {
    async get(url: string | undefined): Promise<CachedAvatar | undefined> {
      if (url === undefined || url.length === 0) return undefined;

      const key = options.hash(url);

      const pending = inFlight.get(key);
      if (pending !== undefined) return pending;

      const request = load(url, key).finally(() => inFlight.delete(key));
      inFlight.set(key, request);

      return request;
    },

    async invalidate(url: string): Promise<void> {
      const key = options.hash(url);
      memory.delete(key);
      await options.diskStore?.delete(key);
    },

    async prune(): Promise<number> {
      let removed = 0;

      for (const [key, entry] of [...memory]) {
        if (isFresh(entry.storedAt)) continue;
        memory.delete(key);
        removed += 1;
      }

      const store = options.diskStore;
      if (store !== undefined) {
        for (const key of await store.keys()) {
          const stored = await store.read(key);
          if (stored === undefined || isFresh(stored.storedAt)) continue;

          await store.delete(key);
          removed += 1;
        }
      }

      expired += removed;
      return removed;
    },

    async clear(): Promise<void> {
      memory.clear();

      const store = options.diskStore;
      if (store === undefined) return;

      for (const key of await store.keys()) await store.delete(key);
    },

    get stats(): AvatarCacheStats {
      return { memoryHits, diskHits, networkLoads, failures, expired, memorySize: memory.size };
    },
  };
}

/** In-memory `AvatarBlobStore`, used by tests and as a safe default when no disk store is wired. */
export function createMemoryBlobStore(): AvatarBlobStore {
  const entries = new Map<string, { blob: AvatarBlob; storedAt: number }>();

  return {
    read: (key) => Promise.resolve(entries.get(key)),
    write: (key, blob, storedAt) => {
      entries.set(key, { blob, storedAt });
      return Promise.resolve();
    },
    delete: (key) => {
      entries.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...entries.keys()]),
  };
}

/**
 * Small non-cryptographic hash (FNV-1a) for cache keys.
 *
 * Cache keys only need to be stable and well distributed, not collision-proof against an attacker,
 * and this keeps the package free of a crypto dependency.
 */
export function hashUrl(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}
