import type { DragChipBitmap } from "../../../src/lib/dragChip";

/**
 * Turns the app's raw RGBA drag chip into something an `<img>` can show. The
 * desktop build hands the same bytes to OLE; the website only needs a preview
 * that follows the pointer.
 */
export function bitmapToDataUrl(bitmap: DragChipBitmap | null): string | null {
  if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) return null;
  try {
    const binary = atob(bitmap.rgba);
    const expected = bitmap.width * bitmap.height * 4;
    if (binary.length < expected) return null;

    const pixels = new Uint8ClampedArray(expected);
    for (let index = 0; index < expected; index += 1) {
      pixels[index] = binary.charCodeAt(index);
    }

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.putImageData(new ImageData(pixels, bitmap.width, bitmap.height), 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
