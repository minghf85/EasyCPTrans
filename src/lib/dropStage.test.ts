import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeItem } from "../test/items";
import type { HistoryItem } from "../types";

const stageImageForDrag = vi.fn<(id: number) => Promise<string>>();

vi.mock("./api", () => ({
  api: {
    stageImageForDrag: (id: number) => stageImageForDrag(id),
  },
}));

const { ensureStagedDropPath, prewarmImageDrop, resetDropStage, stagedDropPath } = await import(
  "./dropStage"
);

const image = (overrides: Partial<HistoryItem> = {}) =>
  makeItem({ id: 1, contentType: "image", content: "data:image/png;base64,AAAA", ...overrides });

/** Lets the prewarm's promise chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetDropStage();
  stageImageForDrag.mockReset();
});

describe("prewarmImageDrop", () => {
  it("stages the item in the background", async () => {
    stageImageForDrag.mockResolvedValue("/tmp/drag-1.png");

    prewarmImageDrop(image());
    await flush();

    expect(stageImageForDrag).toHaveBeenCalledWith(1);
    expect(stagedDropPath(image())).toBe("/tmp/drag-1.png");
  });

  it("stages each item only once", async () => {
    stageImageForDrag.mockResolvedValue("/tmp/drag-1.png");

    prewarmImageDrop(image());
    prewarmImageDrop(image());
    await flush();
    prewarmImageDrop(image());
    await flush();

    expect(stageImageForDrag).toHaveBeenCalledTimes(1);
  });

  it("ignores content that cannot be dragged out", async () => {
    prewarmImageDrop(makeItem({ id: 2, contentType: "text" }));
    prewarmImageDrop(image({ id: 3, isPrivate: true }));
    await flush();

    expect(stageImageForDrag).not.toHaveBeenCalled();
  });

  it("stays quiet when staging fails", async () => {
    stageImageForDrag.mockRejectedValue(new Error("nope"));

    prewarmImageDrop(image());
    await flush();

    expect(stagedDropPath(image())).toBeNull();
  });

  it("retries after a failure instead of caching it", async () => {
    stageImageForDrag.mockRejectedValueOnce(new Error("nope"));
    prewarmImageDrop(image());
    await flush();

    stageImageForDrag.mockResolvedValue("/tmp/drag-1.png");
    prewarmImageDrop(image());
    await flush();

    expect(stageImageForDrag).toHaveBeenCalledTimes(2);
    expect(stagedDropPath(image())).toBe("/tmp/drag-1.png");
  });
});

describe("ensureStagedDropPath", () => {
  it("returns the staged path without another round trip", async () => {
    stageImageForDrag.mockResolvedValue("/tmp/drag-1.png");
    prewarmImageDrop(image());
    await flush();

    expect(await ensureStagedDropPath(image())).toBe("/tmp/drag-1.png");
    expect(stageImageForDrag).toHaveBeenCalledTimes(1);
  });

  it("waits for a prewarm that is still in flight", async () => {
    let release: (path: string) => void = () => {};
    stageImageForDrag.mockReturnValue(
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    );

    prewarmImageDrop(image());
    const pending = ensureStagedDropPath(image());
    release("/tmp/drag-1.png");

    expect(await pending).toBe("/tmp/drag-1.png");
    expect(stageImageForDrag).toHaveBeenCalledTimes(1);
  });

  it("stages on demand when nothing was prewarmed", async () => {
    stageImageForDrag.mockResolvedValue("/tmp/drag-1.png");

    expect(await ensureStagedDropPath(image())).toBe("/tmp/drag-1.png");
    expect(stagedDropPath(image())).toBe("/tmp/drag-1.png");
  });

  it("reports an empty result as a failure", async () => {
    stageImageForDrag.mockResolvedValue("");

    await expect(ensureStagedDropPath(image())).rejects.toThrow("Image content unavailable");
  });
});
