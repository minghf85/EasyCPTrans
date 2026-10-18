/**
 * Card-sized thumbnails for clipboard images.
 *
 * The card shows an image in a 320×128 box, but the stored clipboard payload is
 * the original screenshot. Feeding that straight into an `<img>` makes WebView2
 * decode and keep a full-resolution bitmap for every visible card — a 4K
 * screenshot is ~33 MB of RGBA each — which is the largest transient memory
 * consumer while scrolling the strip. Downscaling once and keeping only the
 * thumbnail caps that at a few hundred KB per card.
 *
 * The full-resolution data URL stays available through `get_image_content` for
 * the lightbox and for copying the image, so nothing is lost.
 */

/** Longest edge of the bitmap a card keeps. At 2× DPR a 320 px card needs 640. */
export const CARD_THUMB_MAX_EDGE = 640;

export interface Size {
  width: number;
  height: number;
}

/**
 * Scales `width × height` down to fit inside `maxEdge × maxEdge`.
 *
 * Returns `null` when the image is already small enough — the caller should then
 * keep the original and skip the canvas pass entirely.
 */
export function fitInside(width: number, height: number, maxEdge: number): Size | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxEdge) ||
    width <= 0 ||
    height <= 0 ||
    maxEdge <= 0
  ) {
    return null;
  }

  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decodes `dataUrl`, downscales it and returns a small data URL.
 *
 * Failure is not an error: an image the browser cannot decode through
 * `createImageBitmap` is returned unchanged, which is exactly what the card did
 * before thumbnails existed. The temporary bitmap is always closed so the
 * full-resolution pixels are released before the card stores the thumbnail.
 */
export async function makeCardThumbnail(dataUrl: string): Promise<string> {
  if (!dataUrl) return dataUrl;

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const size = fitInside(bitmap.width, bitmap.height, CARD_THUMB_MAX_EDGE);
      if (!size) return dataUrl;

      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) return dataUrl;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "medium";
      context.drawImage(bitmap, 0, 0, size.width, size.height);

      // WebP keeps screenshots and photos well under 100 KB at this size. An
      // engine without WebP falls back to PNG, which is still far smaller than
      // the original bitmap.
      return canvas.toDataURL("image/webp", 0.82) || dataUrl;
    } finally {
      bitmap.close();
    }
  } catch {
    return dataUrl;
  }
}
