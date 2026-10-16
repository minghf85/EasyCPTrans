import { afterEach, describe, expect, it } from "vitest";
import {
  MIN_WHITE_TEXT_CONTRAST,
  brandColorFor,
  cachedBrandColor,
  contrastRatioWithWhite,
  dominantColor,
  fallbackBrandColor,
  headerBandColor,
  parseColor,
  prewarmBrandColor,
  relativeLuminance,
  resetBrandColors,
  toCssHsl,
} from "./brandColor";

afterEach(() => {
  resetBrandColors();
});

/** Builds an RGBA buffer from `[r, g, b, a]` quadruples. */
function pixels(...values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values);
}

/** Repeats one colour `times` over, so it dominates the histogram. */
function fill(color: [number, number, number, number], times: number): number[] {
  return Array.from({ length: times }).flatMap(() => [...color]);
}

describe("fallbackBrandColor", () => {
  it("is stable for the same application", () => {
    expect(fallbackBrandColor("notepad")).toBe(fallbackBrandColor("notepad"));
  });

  it("differs between applications", () => {
    expect(fallbackBrandColor("notepad")).not.toBe(fallbackBrandColor("chrome"));
  });

  it("produces a usable colour", () => {
    expect(fallbackBrandColor("notepad")).toMatch(/^hsl\(\d+ 55% 42%\)$/);
  });

  it("copes with an empty seed instead of returning NaN", () => {
    expect(fallbackBrandColor("")).toMatch(/^hsl\(\d+ 55% 42%\)$/);
  });
});

/**
 * Colours are quantised into 16 levels per channel before they are counted, so
 * a result is the centre of the winning bucket rather than the exact input:
 * `rgb(30, 90, 200)` reports as `#1858c8`. That is intentional — an icon's
 * antialiased edges would otherwise split one colour across many buckets — and
 * the shift is asserted here so a change to it cannot pass silently.
 */
describe("dominantColor", () => {
  it("returns nothing for an empty image", () => {
    expect(dominantColor(pixels())).toBeNull();
  });

  it("picks the most common colour", () => {
    const data = pixels(
      ...fill([30, 90, 200, 255], 10),
      ...fill([200, 40, 40, 255], 3),
    );
    expect(dominantColor(data)).toBe("#1858c8");
  });

  it("ignores transparent pixels", () => {
    const data = pixels(
      ...fill([255, 255, 255, 0], 50),
      ...fill([20, 160, 80, 255], 4),
    );
    expect(dominantColor(data)).toBe("#18a858");
  });

  it("ignores the white plate and the black outline of an icon", () => {
    const data = pixels(
      ...fill([255, 255, 255, 255], 40),
      ...fill([12, 12, 12, 255], 20),
      ...fill([0, 120, 215, 255], 6),
    );
    expect(dominantColor(data)).toBe("#0878d8");
  });

  it("returns nothing when only white and black are present", () => {
    const data = pixels(...fill([255, 255, 255, 255], 10), ...fill([0, 0, 0, 255], 10));
    expect(dominantColor(data)).toBeNull();
  });

  it("breaks a tie toward the more colourful bucket", () => {
    const data = pixels(
      ...fill([128, 128, 128, 255], 5), // grey
      ...fill([200, 40, 40, 255], 5), // red, same count
    );
    expect(dominantColor(data)).toBe("#c82828");
  });

  it("ignores a trailing partial pixel", () => {
    const data = pixels(...fill([30, 90, 200, 255], 2), 255, 255, 255);
    expect(dominantColor(data)).toBe("#1858c8");
  });
});

describe("brandColorFor", () => {
  it("uses the fallback until an icon colour has been read", () => {
    expect(brandColorFor("C:\\notepad.exe", "notepad")).toBe(fallbackBrandColor("notepad"));
    expect(cachedBrandColor("C:\\notepad.exe")).toBeNull();
  });

  it("falls back to the key when there is no seed", () => {
    expect(brandColorFor("notepad", "")).toBe(fallbackBrandColor("notepad"));
  });
});

describe("prewarmBrandColor", () => {
  it("resolves without touching the DOM when there is nothing to read", async () => {
    await expect(prewarmBrandColor("", "data:image/png;base64,AAAA")).resolves.toBeNull();
    await expect(prewarmBrandColor("notepad", "")).resolves.toBeNull();
  });
});

describe("parseColor", () => {
  it("reads long hex", () => {
    expect(parseColor("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    expect(parseColor("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(parseColor("#000000")).toEqual({ h: 0, s: 0, l: 0 });
  });

  it("reads short hex", () => {
    expect(parseColor("#f00")).toEqual(parseColor("#ff0000"));
    expect(parseColor("#ABC")).toEqual(parseColor("#aabbcc"));
  });

  it("reads the hsl form this module produces", () => {
    expect(parseColor("hsl(210 55% 42%)")).toEqual({ h: 210, s: 55, l: 42 });
    expect(parseColor("hsl(0 0% 100%)")).toEqual({ h: 0, s: 0, l: 100 });
  });

  it("rejects anything else", () => {
    expect(parseColor("red")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
    expect(parseColor("rgb(1,2,3)")).toBeNull();
    expect(parseColor("")).toBeNull();
  });

  it("round-trips through toCssHsl", () => {
    expect(toCssHsl({ h: 209.6, s: 54.4, l: 41.7 })).toBe("hsl(210 54% 42%)");
  });
});

describe("contrastRatioWithWhite", () => {
  it("is 1:1 for white on white and 21:1 for black", () => {
    expect(contrastRatioWithWhite({ h: 0, s: 0, l: 100 })).toBeCloseTo(1, 5);
    expect(contrastRatioWithWhite({ h: 0, s: 0, l: 0 })).toBeCloseTo(21, 5);
  });

  it("places mid grey around 4:1", () => {
    expect(relativeLuminance({ h: 0, s: 0, l: 50 })).toBeCloseTo(0.214, 2);
  });
});

describe("headerBandColor", () => {
  const samples = [
    "#ffff00", // the worst case: a bright yellow icon
    "#00ff00",
    "#ffffff",
    "#ff0000",
    "#0f6cbd",
    "hsl(210 55% 42%)",
    "hsl(60 90% 80%)",
    // The fallback palette's own hues: every one of them has to survive the
    // darkening loop, since any application without a readable icon lands here.
    "hsl(0 55% 42%)",
    "hsl(60 55% 42%)",
    "hsl(120 55% 42%)",
    "hsl(180 55% 42%)",
    "hsl(240 55% 42%)",
    "hsl(300 55% 42%)",
  ];

  it("always leaves white text legible", () => {
    for (const sample of samples) {
      const band = parseColor(headerBandColor(sample));
      if (!band) throw new Error(`${sample} produced no colour`);
      expect({
        sample,
        ok: contrastRatioWithWhite(band) >= MIN_WHITE_TEXT_CONTRAST,
      }).toEqual({ sample, ok: true });
    }
  });

  it("leaves an already readable colour alone", () => {
    // Dark blue already clears the bar, so nothing about it should change.
    expect(headerBandColor("hsl(210 55% 30%)")).toBe("hsl(210 55% 30%)");
  });

  it("keeps the hue so the band still identifies the program", () => {
    const band = parseColor(headerBandColor("#ffff00"));
    expect(band?.h).toBe(60);
    expect(band?.s).toBe(100);
  });

  it("falls back to a readable colour for unreadable input", () => {
    const band = parseColor(headerBandColor("not a colour"));
    expect(band).not.toBeNull();
    expect(contrastRatioWithWhite(band!)).toBeGreaterThanOrEqual(MIN_WHITE_TEXT_CONTRAST);
  });
});
