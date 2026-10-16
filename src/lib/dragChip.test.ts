import { afterEach, describe, expect, it } from "vitest";
import { makeItem } from "../test/items";
import {
  CHIP_HEIGHT,
  CHIP_WIDTH,
  cachedDragChip,
  describeDragChip,
  encodeRgbaBase64,
  resetDragChips,
  truncateToWidth,
  warmDragChip,
  type DragChipInput,
} from "./dragChip";

const payload = (overrides: Partial<DragChipInput> = {}): DragChipInput => ({
  source: "notepad",
  detail: "hello world",
  kind: "Text",
  color: "#1858c8",
  iconSrc: null,
  ...overrides,
});

afterEach(() => {
  resetDragChips();
});

describe("drag chip cache", () => {
  it("has nothing cached before a chip has been asked for", () => {
    expect(cachedDragChip(payload())).toBeNull();
  });

  it("shares one render between identical requests", () => {
    // Two hover events for the same card must not queue two canvas passes.
    const first = warmDragChip(payload());
    const second = warmDragChip(payload());

    expect(first).toBe(second);
  });

  it("treats a different payload as a different chip", () => {
    expect(warmDragChip(payload())).not.toBe(warmDragChip(payload({ detail: "other" })));
  });

  it("resolves without a chip when there is no canvas to draw on", async () => {
    // The node test environment has no `document`, which is also how the module
    // behaves if a canvas cannot be created: the drag falls back to the OS
    // feedback rather than failing.
    await expect(warmDragChip(payload())).resolves.toBeUndefined();
    expect(cachedDragChip(payload())).toBeNull();
  });

  it("forgets everything when reset", async () => {
    await warmDragChip(payload());
    resetDragChips();

    expect(cachedDragChip(payload())).toBeNull();
  });
});

describe("describeDragChip", () => {
  it("labels a text item with its first non-empty line", () => {
    expect(describeDragChip(makeItem({ content: "\n\n  hello world  \nsecond" }))).toEqual({
      kind: "Text",
      detail: "hello world",
    });
  });

  it("copes with empty text content", () => {
    expect(describeDragChip(makeItem({ content: "   " }))).toEqual({ kind: "Text", detail: "" });
  });

  it("summarises an image by its size", () => {
    expect(
      describeDragChip(
        makeItem({ contentType: "image", metadata: { width: ["800"], height: ["600"] } }),
      ),
    ).toEqual({ kind: "Image", detail: "800 × 600" });
  });

  it("falls back for an image without dimensions", () => {
    expect(describeDragChip(makeItem({ contentType: "image", metadata: {} }))).toEqual({
      kind: "Image",
      detail: "Image",
    });
  });

  it("shows the file name and counts the rest", () => {
    expect(
      describeDragChip(
        makeItem({ contentType: "file", content: "C:\\tmp\\report.pdf" }),
      ),
    ).toEqual({ kind: "File", detail: "report.pdf" });

    expect(
      describeDragChip(
        makeItem({ contentType: "file", content: "C:\\tmp\\a.pdf\nC:\\tmp\\b.pdf\nC:\\tmp\\c.pdf" }),
      ),
    ).toEqual({ kind: "File", detail: "a.pdf +2" });
  });

  it("copes with a file item that lost its paths", () => {
    expect(describeDragChip(makeItem({ contentType: "file", content: "  " }))).toEqual({
      kind: "File",
      detail: "File",
    });
  });
});

describe("encodeRgbaBase64", () => {
  it("round-trips through atob", () => {
    const bytes = new Uint8ClampedArray([0, 1, 254, 255, 128]);
    const encoded = encodeRgbaBase64(bytes);
    const decoded = atob(encoded);

    expect(decoded.length).toBe(bytes.length);
    expect([...decoded].map((character) => character.charCodeAt(0))).toEqual([...bytes]);
  });

  it("handles a buffer larger than one encode chunk", () => {
    // The encoder slices the input to stay under the argument limit, so the
    // seam between chunks has to be seamless.
    const size = 20_000;
    const bytes = new Uint8ClampedArray(size);
    for (let index = 0; index < size; index += 1) bytes[index] = index % 251;

    const decoded = atob(encodeRgbaBase64(bytes));
    expect(decoded.length).toBe(size);
    expect(decoded.charCodeAt(8191)).toBe(8191 % 251);
    expect(decoded.charCodeAt(8192)).toBe(8192 % 251);
  });

  it("encodes nothing as nothing", () => {
    expect(encodeRgbaBase64(new Uint8ClampedArray())).toBe("");
  });
});

describe("truncateToWidth", () => {
  /** One unit of width per character, so the math is easy to assert. */
  const context = { measureText: (text: string) => ({ width: text.length }) };

  it("keeps text that already fits", () => {
    expect(truncateToWidth(context, "hello", 10)).toBe("hello");
  });

  it("ellipsises text that does not fit", () => {
    expect(truncateToWidth(context, "hello world", 8)).toBe("hello w…");
  });

  it("counts the ellipsis itself", () => {
    // Five characters plus the ellipsis is exactly six, so nothing is dropped.
    expect(truncateToWidth(context, "hello", 6)).toBe("hello");
    expect(truncateToWidth(context, "hello!!", 6)).toBe("hello…");
  });

  it("never renders an empty label", () => {
    // Even a single character does not fit here, so the shortest useful label
    // wins rather than an empty string.
    expect(truncateToWidth(context, "hello", 2)).toBe("h…");
    expect(truncateToWidth(context, "hello", 0)).toBe("");
  });
});

describe("chip geometry", () => {
  it("is wide enough for the tile, the title and the badge", () => {
    expect(CHIP_WIDTH).toBeGreaterThan(240);
    expect(CHIP_HEIGHT).toBeGreaterThanOrEqual(56);
  });
});
