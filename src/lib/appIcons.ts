import { api } from "./api";

/**
 * Cache of source-application icons, keyed by executable path.
 *
 * Rust hands back raw RGBA because it has no image encoder; the canvas here is
 * what turns that into something an `<img>` can render. Values are `null` when
 * the executable has no icon, so a miss is remembered and not re-fetched.
 */

const MAX_ENTRIES = 48;

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

/** `undefined` means "not looked up yet"; `null` means "known to have none". */
export function getCachedAppIcon(appPath: string): string | null | undefined {
  return cache.get(appPath);
}

export function fetchAppIcon(appPath: string): Promise<string | null> {
  if (!appPath) return Promise.resolve(null);

  const cached = cache.get(appPath);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inflight.get(appPath);
  if (pending) return pending;

  const promise = api
    .getAppIcon(appPath)
    .then((icon) => {
      const dataUrl = icon ? rgbaToDataUrl(icon.width, icon.height, icon.rgba) : null;
      remember(appPath, dataUrl);
      return dataUrl;
    })
    .catch(() => {
      remember(appPath, null);
      return null;
    })
    .finally(() => {
      inflight.delete(appPath);
    });

  inflight.set(appPath, promise);
  return promise;
}

function remember(appPath: string, dataUrl: string | null) {
  cache.set(appPath, dataUrl);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function rgbaToDataUrl(width: number, height: number, rgbaBase64: string): string | null {
  if (width <= 0 || height <= 0) return null;
  try {
    const binary = atob(rgbaBase64);
    const expected = width * height * 4;
    if (binary.length < expected) return null;

    const pixels = new Uint8ClampedArray(expected);
    for (let index = 0; index < expected; index += 1) {
      pixels[index] = binary.charCodeAt(index);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
