import { describe, expect, it, vi } from 'vitest';

import {
  createAvatarCache,
  createMemoryBlobStore,
  hashUrl,
  type AvatarBlob,
} from './avatarCache.js';

const blob = (label: string): AvatarBlob => ({
  bytes: new Uint8Array([label.charCodeAt(0)]),
  mime: 'image/webp',
});

function setup(options: { ttlMs?: number; memoryCapacity?: number; withDisk?: boolean } = {}) {
  let now = 1_000;
  const clock = { now: () => now };
  const advance = (ms: number): void => {
    now += ms;
  };

  const fetchAvatar = vi.fn(async (url: string) => {
    await Promise.resolve();
    return blob(url);
  });

  const diskStore = options.withDisk === false ? undefined : createMemoryBlobStore();

  const cache = createAvatarCache({
    clock,
    hash: hashUrl,
    fetchAvatar,
    ...(diskStore === undefined ? {} : { diskStore }),
    ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }),
    ...(options.memoryCapacity === undefined ? {} : { memoryCapacity: options.memoryCapacity }),
  });

  return { cache, fetchAvatar, advance, diskStore };
}

describe('cache hit / miss', () => {
  it('loads from the network on a miss, then serves from memory', async () => {
    const { cache, fetchAvatar } = setup();

    const first = await cache.get('https://cdn/a.webp');
    const second = await cache.get('https://cdn/a.webp');

    expect(first?.source).toBe('network');
    expect(second?.source).toBe('memory');
    expect(fetchAvatar).toHaveBeenCalledTimes(1);
    expect(cache.stats).toMatchObject({ networkLoads: 1, memoryHits: 1 });
  });

  it('keys by url hash, so different urls do not collide', async () => {
    const { cache, fetchAvatar } = setup();

    await cache.get('https://cdn/a.webp');
    await cache.get('https://cdn/b.webp');

    expect(fetchAvatar).toHaveBeenCalledTimes(2);
    expect(hashUrl('https://cdn/a.webp')).not.toBe(hashUrl('https://cdn/b.webp'));
    expect(hashUrl('https://cdn/a.webp')).toBe(hashUrl('https://cdn/a.webp'));
  });

  it('falls back to the disk store when the memory entry is gone', async () => {
    const { cache, advance } = setup({ ttlMs: 10_000, memoryCapacity: 1 });

    await cache.get('https://cdn/a.webp');
    // A second avatar evicts the first from the 1-entry memory cache.
    await cache.get('https://cdn/b.webp');
    advance(1_000);

    const again = await cache.get('https://cdn/a.webp');

    expect(again?.source).toBe('disk');
    expect(cache.stats.diskHits).toBe(1);
  });

  it('de-duplicates concurrent requests for the same avatar', async () => {
    const { cache, fetchAvatar } = setup();

    const [first, second, third] = await Promise.all([
      cache.get('https://cdn/same.webp'),
      cache.get('https://cdn/same.webp'),
      cache.get('https://cdn/same.webp'),
    ]);

    expect(fetchAvatar).toHaveBeenCalledTimes(1);
    expect(first?.bytes).toEqual(second?.bytes);
    expect(third).toBeDefined();
  });

  it('ignores an empty or missing url without touching the network', async () => {
    const { cache, fetchAvatar } = setup();

    expect(await cache.get(undefined)).toBeUndefined();
    expect(await cache.get('')).toBeUndefined();
    expect(fetchAvatar).not.toHaveBeenCalled();
  });
});

describe('expiry (Blueprint §34 TTL)', () => {
  it('re-fetches once the TTL has elapsed', async () => {
    const { cache, fetchAvatar, advance } = setup({ ttlMs: 5_000 });

    await cache.get('https://cdn/a.webp');
    advance(4_999);
    expect((await cache.get('https://cdn/a.webp'))?.source).toBe('memory');

    advance(2);
    const afterExpiry = await cache.get('https://cdn/a.webp');

    expect(afterExpiry?.source).toBe('network');
    expect(fetchAvatar).toHaveBeenCalledTimes(2);
    expect(cache.stats.expired).toBeGreaterThan(0);
  });

  it('treats an expired disk entry as a miss', async () => {
    const { cache, advance, diskStore } = setup({ ttlMs: 1_000, memoryCapacity: 1 });

    await cache.get('https://cdn/a.webp');
    await cache.get('https://cdn/b.webp'); // evict a from memory
    advance(5_000);

    expect((await cache.get('https://cdn/a.webp'))?.source).toBe('network');
    expect(await diskStore?.read(hashUrl('https://cdn/a.webp'))).toBeDefined();
  });

  it('prunes expired entries from memory and disk', async () => {
    const { cache, advance, diskStore } = setup({ ttlMs: 1_000 });

    await cache.get('https://cdn/a.webp');
    await cache.get('https://cdn/b.webp');
    advance(10_000);

    const removed = await cache.prune();

    expect(removed).toBeGreaterThanOrEqual(2);
    expect(cache.stats.memorySize).toBe(0);
    expect(await diskStore?.keys()).toHaveLength(0);
  });

  it('defaults the TTL inside the 24-72h band', async () => {
    const { cache, advance } = setup();

    await cache.get('https://cdn/a.webp');
    advance(23 * 60 * 60_000);

    expect((await cache.get('https://cdn/a.webp'))?.source).toBe('memory');
  });
});

describe('failure handling', () => {
  it('returns undefined on a network failure so the caller uses the fallback avatar', async () => {
    let now = 0;
    const cache = createAvatarCache({
      clock: { now: () => now },
      hash: hashUrl,
      fetchAvatar: () => Promise.reject(new Error('404')),
    });
    now += 1;

    expect(await cache.get('https://cdn/gone.webp')).toBeUndefined();
    expect(cache.stats.failures).toBe(1);
  });

  it('retries after a failure instead of caching the failure', async () => {
    let attempt = 0;
    const cache = createAvatarCache({
      clock: { now: () => 1_000 },
      hash: hashUrl,
      fetchAvatar: () => {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('flaky')) : Promise.resolve(blob('x'));
      },
    });

    expect(await cache.get('https://cdn/a.webp')).toBeUndefined();
    expect((await cache.get('https://cdn/a.webp'))?.source).toBe('network');
  });

  it('works with no disk store at all', async () => {
    const { cache } = setup({ withDisk: false });

    expect((await cache.get('https://cdn/a.webp'))?.source).toBe('network');
    expect((await cache.get('https://cdn/a.webp'))?.source).toBe('memory');
  });
});

describe('bounds and invalidation', () => {
  it('keeps memory bounded by capacity', async () => {
    const { cache } = setup({ memoryCapacity: 3 });

    for (let index = 0; index < 20; index += 1) {
      await cache.get(`https://cdn/${index}.webp`);
    }

    expect(cache.stats.memorySize).toBe(3);
  });

  it('invalidates a single avatar from both layers', async () => {
    const { cache, diskStore } = setup();

    await cache.get('https://cdn/a.webp');
    await cache.invalidate('https://cdn/a.webp');

    expect(cache.stats.memorySize).toBe(0);
    expect(await diskStore?.read(hashUrl('https://cdn/a.webp'))).toBeUndefined();
    expect((await cache.get('https://cdn/a.webp'))?.source).toBe('network');
  });

  it('clears everything', async () => {
    const { cache, diskStore } = setup();

    await cache.get('https://cdn/a.webp');
    await cache.get('https://cdn/b.webp');
    await cache.clear();

    expect(cache.stats.memorySize).toBe(0);
    expect(await diskStore?.keys()).toHaveLength(0);
  });
});
