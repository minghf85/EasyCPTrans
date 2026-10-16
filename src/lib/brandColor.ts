/**
 * The colour that identifies a source application.
 *
 * Taken from the application's own icon, so a card wears the same colour the
 * user sees in their taskbar. When there is no icon to read — an elevated
 * process, a window that closed, a capture that failed — it falls back to a hue
 * derived from the executable name, which is stable across restarts and matches
 * the monogram tile on the card.
 */

/** Keyed by executable path, the same key the icon cache uses. */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** Stable colour for an application that has no readable icon. */
export function fallbackBrandColor(seed: string): string {
  return `hsl(${hashSeed(seed) % 360} 55% 42%)`;
}

const BUCKET_SHIFT = 4;
const NEAR_WHITE = 235;
const NEAR_BLACK = 25;

function bucketKey(red: number, green: number, blue: number): number {
  return (
    ((red >> BUCKET_SHIFT) << 8) | ((green >> BUCKET_SHIFT) << 4) | (blue >> BUCKET_SHIFT)
  );
}

function bucketHex(key: number): string {
  const channel = (value: number) => {
    // Centre of the bucket, so a pure #0000ff icon does not report #0808f8.
    const widened = (value << BUCKET_SHIFT) | (1 << (BUCKET_SHIFT - 1));
    return Math.min(255, widened).toString(16).padStart(2, "0");
  };
  return `#${channel((key >> 8) & 0xf)}${channel((key >> 4) & 0xf)}${channel(key & 0xf)}`;
}

function bucketSaturation(key: number): number {
  const red = (key >> 8) & 0xf;
  const green = (key >> 4) & 0xf;
  const blue = key & 0xf;
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

/**
 * The most common colourful pixel of an icon.
 *
 * Icons are mostly transparent margin plus a black outline and a white plate, so
 * those are skipped: without that filter every application would come out the
 * same shade of grey. Returns `null` when nothing survives the filter.
 */
export function dominantColor(pixels: Uint8ClampedArray): string | null {
  const counts = new Map<number, number>();

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (Math.min(red, green, blue) > NEAR_WHITE) continue;
    if (Math.max(red, green, blue) < NEAR_BLACK) continue;

    const key = bucketKey(red, green, blue);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: { hex: string; count: number; saturation: number } | null = null;
  for (const [key, count] of counts) {
    const saturation = bucketSaturation(key);
    if (!best || count > best.count || (count === best.count && saturation > best.saturation)) {
      best = { hex: bucketHex(key), count, saturation };
    }
  }

  return best?.hex ?? null;
}

/** The colour already worked out for an application, if it has been. */
export function cachedBrandColor(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Cache first, stable fallback otherwise. Safe to call while rendering. */
export function brandColorFor(key: string, fallbackSeed: string): string {
  return cache.get(key) ?? fallbackBrandColor(fallbackSeed || key);
}

export interface Hsl {
  /** Degrees, 0–360. */
  h: number;
  /** Percent, 0–100. */
  s: number;
  /** Percent, 0–100. */
  l: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const HSL_PATTERN = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i;

/** Reads the two colour forms this module produces. */
export function parseColor(color: string): Hsl | null {
  const value = color.trim();

  const hex = value.match(HEX_PATTERN);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const red = parseInt(digits.slice(0, 2), 16) / 255;
    const green = parseInt(digits.slice(2, 4), 16) / 255;
    const blue = parseInt(digits.slice(4, 6), 16) / 255;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) return { h: 0, s: 0, l: lightness * 100 };

    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    const hue =
      max === red
        ? 60 * (((green - blue) / delta) % 6)
        : max === green
          ? 60 * ((blue - red) / delta + 2)
          : 60 * ((red - green) / delta + 4);

    return { h: (hue + 360) % 360, s: saturation * 100, l: lightness * 100 };
  }

  const hsl = value.match(HSL_PATTERN);
  if (hsl) {
    return { h: Number(hsl[1]), s: Number(hsl[2]), l: Number(hsl[3]) };
  }

  return null;
}

export function toCssHsl({ h, s, l }: Hsl): string {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

function channelLuminance(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Hsl): number {
  const { h, s, l } = color;
  const saturation = s / 100;
  const lightness = l / 100;

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const offset = lightness - chroma / 2;

  const sector = Math.floor(h / 60) % 6;
  const [red, green, blue] = (
    [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ] as Array<[number, number, number]>
  )[sector];

  return (
    0.2126 * channelLuminance(red + offset) +
    0.7152 * channelLuminance(green + offset) +
    0.0722 * channelLuminance(blue + offset)
  );
}

/** Contrast of a colour against white text, 1:1 to 21:1. */
export function contrastRatioWithWhite(color: Hsl): number {
  return 1.05 / (relativeLuminance(color) + 0.05);
}

/** WCAG AA for normal-size text. The card header uses it for white labels. */
export const MIN_WHITE_TEXT_CONTRAST = 4.5;

/**
 * The brand colour, darkened until white text on it is legible.
 *
 * A card header is a band of the source application's colour with white text on
 * top, and an application whose icon is yellow would otherwise produce a band
 * nobody can read. Hue and saturation are left alone — only lightness gives way —
 * so the band still identifies the program it came from.
 */
export function headerBandColor(color: string): string {
  const parsed = parseColor(color) ?? parseColor(fallbackBrandColor("easycptrans"));
  if (!parsed) return fallbackBrandColor("easycptrans");

  const adjusted: Hsl = { ...parsed };
  while (contrastRatioWithWhite(adjusted) < MIN_WHITE_TEXT_CONTRAST && adjusted.l > 6) {
    adjusted.l -= 3;
  }
  return toCssHsl(adjusted);
}

/**
 * Resolves an application's colour, reading its icon if that has not happened
 * yet. Resolves to the colour, or `null` when the icon could not be read — the
 * caller keeps the fallback in that case.
 *
 * Callers are expected to prewarm this, so rendering stays synchronous.
 */
export function prewarmBrandColor(key: string, iconSrc: string): Promise<string | null> {
  if (!key || !iconSrc) return Promise.resolve(null);

  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        if (canvas.width === 0 || canvas.height === 0) {
          resolve(null);
          return;
        }
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0);
        resolve(dominantColor(context.getImageData(0, 0, canvas.width, canvas.height).data));
      } catch {
        // A tainted canvas or a decode failure just leaves the fallback in place.
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = iconSrc;
  })
    .then((colour) => {
      if (colour) cache.set(key, colour);
      return colour;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

/** Test seam: the module-level cache would otherwise leak between tests. */
export function resetBrandColors() {
  cache.clear();
  inflight.clear();
}
