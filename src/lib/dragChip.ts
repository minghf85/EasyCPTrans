import type { HistoryItem } from "../types";
import { fileBasename } from "./fileIcons";

/**
 * The bitmap the native drag loop shows under the cursor.
 *
 * OLE draws the drag image itself, so the picture has to be handed over as
 * pixels rather than as DOM: the chip is painted onto a canvas and sent to Rust
 * as raw RGBA, which turns it into the DIB that `IDragSourceHelper` wants. The
 * layout is deliberately compact — the ghost follows the cursor, and a
 * full-size card would hide the very target the user is aiming at.
 */

/** Logical size in CSS pixels; the bitmap is rendered at the display's scale. */
export const CHIP_WIDTH = 296;
export const CHIP_HEIGHT = 64;

const CORNER = 12;
const BAR_WIDTH = 4;

export interface DragChipDescription {
  /** English type label, matching the badges the cards already use. */
  kind: string;
  /** One line describing the payload. */
  detail: string;
}

/** The label and the summary line for a payload, independent of any canvas. */
export function describeDragChip(item: HistoryItem): DragChipDescription {
  if (item.contentType === "image") {
    const width = item.metadata?.width?.[0];
    const height = item.metadata?.height?.[0];
    return {
      kind: "Image",
      detail: width && height ? `${width} × ${height}` : "Image",
    };
  }

  if (item.contentType === "file") {
    const paths = item.content
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean);
    if (paths.length === 0) return { kind: "File", detail: "File" };

    const first = fileBasename(paths[0]);
    return {
      kind: "File",
      detail: paths.length > 1 ? `${first} +${paths.length - 1}` : first,
    };
  }

  const firstLine = item.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return { kind: "Text", detail: firstLine ?? "" };
}

/** Base64 of RGBA8 bytes, the same wire shape `get_app_icon` returns. */
export function encodeRgbaBase64(rgba: Uint8ClampedArray | Uint8Array): string {
  let binary = "";
  // `String.fromCharCode` takes arguments, not an array: keep each call small
  // enough to stay clear of the engine's argument limit.
  const chunkSize = 8192;
  for (let offset = 0; offset < rgba.length; offset += chunkSize) {
    binary += String.fromCharCode(...rgba.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

interface TextMetricsLike {
  measureText(text: string): { width: number };
}

/** Shortens text with an ellipsis until it fits, never returning an empty label. */
export function truncateToWidth(
  context: TextMetricsLike,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return "";
  if (context.measureText(text).width <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut.length > 0 ? `${cut}…` : "…";
}

export interface DragChipBitmap {
  width: number;
  height: number;
  /** Base64 RGBA8, row-major, top-down. */
  rgba: string;
}

export interface DragChipInput {
  /** Source application, shown as the chip title. */
  source: string;
  /** Summary line under it. */
  detail: string;
  /** Type badge text. */
  kind: string;
  /** Brand colour of the source application. */
  color: string;
  /** Application icon as a data URL, when one is cached. */
  iconSrc: string | null;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawTile(
  context: CanvasRenderingContext2D,
  input: DragChipInput,
  icon: HTMLImageElement | null,
) {
  const size = 36;
  const x = 14;
  const y = (CHIP_HEIGHT - size) / 2;

  roundedRect(context, x, y, size, size, 8);
  context.fillStyle = "#f8fafc";
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = "#e5e7eb";
  context.stroke();

  if (icon) {
    context.save();
    roundedRect(context, x + 4, y + 4, size - 8, size - 8, 5);
    context.clip();
    context.drawImage(icon, x + 4, y + 4, size - 8, size - 8);
    context.restore();
    return;
  }

  // No icon: an initial in the brand colour, matching the card's monogram.
  const initial = (input.source.trim().replace(/^\.+/, "").charAt(0) || "?").toUpperCase();
  context.fillStyle = input.color;
  context.font = '600 16px "Segoe UI Variable Text", "Segoe UI", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(initial, x + size / 2, y + size / 2 + 1);
  context.textAlign = "left";
}

/** Paints the chip. Split out so the geometry stays readable and swappable. */
function drawChip(
  context: CanvasRenderingContext2D,
  input: DragChipInput,
  icon: HTMLImageElement | null,
) {
  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.22)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 3;
  roundedRect(context, 1, 1, CHIP_WIDTH - 2, CHIP_HEIGHT - 4, CORNER);
  context.fillStyle = "#ffffff";
  context.fill();
  context.restore();

  context.save();
  roundedRect(context, 1, 1, CHIP_WIDTH - 2, CHIP_HEIGHT - 4, CORNER);
  context.strokeStyle = "#e5e7eb";
  context.lineWidth = 1;
  context.stroke();
  // The brand bar is clipped to the chip, so its corners stay rounded.
  context.clip();
  context.fillStyle = input.color;
  context.fillRect(1, 1, BAR_WIDTH, CHIP_HEIGHT - 4);
  context.restore();

  drawTile(context, input, icon);

  const textLeft = 62;
  const kindWidth = input.kind.length * 7 + 18;
  const textRight = CHIP_WIDTH - 20 - kindWidth;
  const maxTextWidth = Math.max(40, textRight - textLeft);

  context.fillStyle = "#0f172a";
  context.font = '600 13px "Segoe UI Variable Text", "Segoe UI", sans-serif';
  context.textBaseline = "alphabetic";
  context.fillText(truncateToWidth(context, input.source, maxTextWidth), textLeft, 28);

  context.fillStyle = "#64748b";
  context.font = '400 11px "Segoe UI Variable Text", "Segoe UI", sans-serif';
  context.fillText(truncateToWidth(context, input.detail, maxTextWidth), textLeft, 46);

  // Type badge, right aligned.
  const badgeWidth = kindWidth;
  const badgeX = CHIP_WIDTH - 14 - badgeWidth;
  roundedRect(context, badgeX, 22, badgeWidth, 20, 6);
  context.fillStyle = "#f1f5f9";
  context.fill();
  context.fillStyle = "#475569";
  context.font = '600 11px "Segoe UI Variable Text", "Segoe UI", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(input.kind, badgeX + badgeWidth / 2, 32);
  context.textAlign = "left";
}

/**
 * Renders the drag image, or returns `null` when a bitmap cannot be produced —
 * the drag still works, it just falls back to the default cursor feedback.
 *
 * Callers are expected to prewarm this (see `ClipboardCard`) so the drag loop
 * never waits on an image decode.
 */
export async function renderDragChip(input: DragChipInput): Promise<DragChipBitmap | null> {
  if (typeof document === "undefined") return null;

  const icon = await loadImage(input.iconSrc);

  try {
    const scale = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    const canvas = document.createElement("canvas");
    canvas.width = CHIP_WIDTH * scale;
    canvas.height = CHIP_HEIGHT * scale;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.scale(scale, scale);
    drawChip(context, input, icon);

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, rgba: encodeRgbaBase64(data) };
  } catch {
    // A missing canvas or a decode failure is not worth failing a drag over.
    return null;
  }
}

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Rendered chips, kept per payload signature.
 *
 * Rendering one costs a canvas, a `getImageData` and a base64 encode of a few
 * hundred kilobytes — far too much to do for every card as it mounts, which is
 * exactly what a page of fifty cards used to do on every tag switch. Chips are
 * therefore produced on hover, which is always ahead of a drag because a drag
 * can only start from a pointer that is already on the card.
 */
const READY = new Map<string, DragChipBitmap>();
const PENDING = new Map<string, Promise<void>>();
const MAX_CHIPS = 24;

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

/** Identifies a chip by everything that would change its pixels. */
function signatureOf(input: DragChipInput): string {
  const icon = input.iconSrc ? hashText(input.iconSrc) : 0;
  return `${input.kind}\u0000${input.source}\u0000${input.detail}\u0000${input.color}\u0000${icon}`;
}

/** The chip for this payload, if it has already been rendered. */
export function cachedDragChip(input: DragChipInput): DragChipBitmap | null {
  return READY.get(signatureOf(input)) ?? null;
}

/**
 * Renders the chip in the background so the drag can pick it up synchronously.
 * Repeat calls for the same payload share one render.
 */
export function warmDragChip(input: DragChipInput): Promise<void> {
  const key = signatureOf(input);
  if (READY.has(key)) return Promise.resolve();

  const existing = PENDING.get(key);
  if (existing) return existing;

  const task = renderDragChip(input)
    .then((bitmap) => {
      if (!bitmap) return;
      READY.set(key, bitmap);
      while (READY.size > MAX_CHIPS) {
        const oldest = READY.keys().next().value;
        if (oldest === undefined) break;
        READY.delete(oldest);
      }
    })
    .catch(() => {
      // No chip is not a failure: the drag falls back to the default feedback.
    })
    .finally(() => {
      PENDING.delete(key);
    });

  PENDING.set(key, task);
  return task;
}

/** Test seam: the module-level caches would otherwise leak between tests. */
export function resetDragChips() {
  READY.clear();
  PENDING.clear();
}
