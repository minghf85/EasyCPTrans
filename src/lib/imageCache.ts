const MAX_ENTRIES = 8;
const TTL_MS = 60_000;

let clock = 0;

interface CacheEntry {
  dataUrl: string;
  lastAccess: number;
  order: number;
}

const cache = new Map<number, CacheEntry>();
const inflight = new Map<number, Promise<string>>();

function evictExpired() {
  const now = Date.now();
  for (const [id, entry] of cache) {
    if (now - entry.lastAccess > TTL_MS) {
      cache.delete(id);
    }
  }
}

function evictOldest() {
  let oldestId: number | undefined;
  let oldestOrder = Infinity;
  for (const [id, entry] of cache) {
    if (entry.order < oldestOrder) {
      oldestOrder = entry.order;
      oldestId = id;
    }
  }
  if (oldestId !== undefined) cache.delete(oldestId);
}

export function getCachedImage(id: number): string | null {
  const entry = cache.get(id);
  if (entry === undefined) return null;
  if (Date.now() - entry.lastAccess > TTL_MS) {
    cache.delete(id);
    return null;
  }
  entry.lastAccess = Date.now();
  entry.order = ++clock;
  return entry.dataUrl;
}

export function rememberImage(id: number, dataUrl: string) {
  cache.set(id, { dataUrl, lastAccess: Date.now(), order: ++clock });
  evictExpired();
  while (cache.size > MAX_ENTRIES) {
    evictOldest();
  }
}

export function forgetImage(id: number) {
  cache.delete(id);
}

export function fetchImageDataUrl(
  id: number,
  fetcher: (id: number) => Promise<string>,
): Promise<string> {
  const hit = getCachedImage(id);
  if (hit !== null) return Promise.resolve(hit);

  const pending = inflight.get(id);
  if (pending) return pending;

  const promise = fetcher(id)
    .then((dataUrl) => {
      inflight.delete(id);
      if (dataUrl) rememberImage(id, dataUrl);
      return dataUrl;
    })
    .catch((err) => {
      inflight.delete(id);
      throw err;
    });
  inflight.set(id, promise);
  return promise;
}
