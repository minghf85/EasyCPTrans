const MAX_ENTRIES = 24;

const cache = new Map<number, string>();
const inflight = new Map<number, Promise<string>>();

export function getCachedImage(id: number): string | null {
  const hit = cache.get(id);
  if (hit === undefined) return null;
  cache.delete(id);
  cache.set(id, hit);
  return hit;
}

export function rememberImage(id: number, dataUrl: string) {
  cache.set(id, dataUrl);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
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
