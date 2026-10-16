import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The module keeps its cache in module-level maps, so every test re-imports a
 * fresh copy to stay independent of the others.
 */
async function freshCache() {
  vi.resetModules();
  return import("./imageCache");
}

const dataUrl = (marker: string) => `data:image/png;base64,${marker}`;

beforeEach(() => {
  vi.resetModules();
});

describe("fetchImageDataUrl", () => {
  it("fetches once and serves the cached value afterwards", async () => {
    const cache = await freshCache();
    const fetcher = vi.fn(async () => dataUrl("AAA"));

    expect(await cache.fetchImageDataUrl(1, fetcher)).toBe(dataUrl("AAA"));
    expect(await cache.fetchImageDataUrl(1, fetcher)).toBe(dataUrl("AAA"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent requests for the same id", async () => {
    const cache = await freshCache();
    let release: (value: string) => void = () => {};
    const fetcher = vi.fn(() => new Promise<string>((resolve) => {
      release = resolve;
    }));

    const first = cache.fetchImageDataUrl(7, fetcher);
    const second = cache.fetchImageDataUrl(7, fetcher);
    release(dataUrl("BBB"));

    expect(await first).toBe(dataUrl("BBB"));
    expect(await second).toBe(dataUrl("BBB"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps separate ids independent", async () => {
    const cache = await freshCache();
    const fetcher = vi.fn(async (id: number) => dataUrl(String(id)));

    expect(await cache.fetchImageDataUrl(1, fetcher)).toBe(dataUrl("1"));
    expect(await cache.fetchImageDataUrl(2, fetcher)).toBe(dataUrl("2"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache an empty result", async () => {
    const cache = await freshCache();
    const fetcher = vi.fn(async () => "");

    expect(await cache.fetchImageDataUrl(3, fetcher)).toBe("");
    expect(cache.getCachedImage(3)).toBeNull();

    await cache.fetchImageDataUrl(3, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not poison the id after a failed fetch", async () => {
    const cache = await freshCache();
    const fetcher = vi.fn<(id: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(dataUrl("CCC"));

    await expect(cache.fetchImageDataUrl(4, fetcher)).rejects.toThrow("boom");
    // The in-flight entry must have been cleared, otherwise every later
    // request would replay the same rejection forever.
    expect(await cache.fetchImageDataUrl(4, fetcher)).toBe(dataUrl("CCC"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("rememberImage / getCachedImage", () => {
  it("reports a miss for an unknown id", async () => {
    const cache = await freshCache();
    expect(cache.getCachedImage(99)).toBeNull();
  });

  it("evicts the oldest entry once the cache is full", async () => {
    const cache = await freshCache();
    const size = 24; // MAX_ENTRIES

    for (let index = 0; index < size + 1; index += 1) {
      cache.rememberImage(index, dataUrl(`v${index}`));
    }

    expect(cache.getCachedImage(0)).toBeNull();
    expect(cache.getCachedImage(size)).toBe(dataUrl(`v${size}`));
  });

  it("counts a read as recent, so a read entry survives the next eviction", async () => {
    const cache = await freshCache();
    const size = 24;

    for (let index = 0; index < size; index += 1) {
      cache.rememberImage(index, dataUrl(`v${index}`));
    }
    expect(cache.getCachedImage(0)).toBe(dataUrl("v0")); // touched

    cache.rememberImage(999, dataUrl("v999"));

    expect(cache.getCachedImage(0)).toBe(dataUrl("v0"));
    expect(cache.getCachedImage(1)).toBeNull();
  });
});
