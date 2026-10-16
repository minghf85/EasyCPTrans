import type { HistoryItem } from "../types";
import { api } from "./api";

/**
 * Temporary files staged for drag-out.
 *
 * `DoDragDrop` blocks until the drop resolves and has to be entered while the
 * mouse button is still held, so every round trip before it is a chance for the
 * gesture to be over before the drag has begun. An image card used to need
 * three (fetch the data URL, write a temp file, start the drag); staging the
 * file as soon as the image is on screen leaves one.
 */

/** Item id → absolute path of the staged file. */
const staged = new Map<number, string>();
const inflight = new Map<number, Promise<void>>();

/**
 * The already-staged path for an item, if there is one.
 *
 * Ids come from an `AUTOINCREMENT` column and are never reused, so an entry left
 * behind by a deleted item can never be served to a different one.
 */
export function stagedDropPath(item: HistoryItem): string | null {
  return staged.get(item.id) ?? null;
}

/**
 * Stages the item's image in the background.
 *
 * Failures are swallowed: dragging still works without the prewarm, it just
 * costs the extra round trip, and an image that cannot be staged cannot be
 * dragged anyway.
 */
export function prewarmImageDrop(item: HistoryItem): void {
  if (item.contentType !== "image" || item.isPrivate) return;
  if (staged.has(item.id) || inflight.has(item.id)) return;

  const task = api
    .stageImageForDrag(item.id)
    .then((path) => {
      if (path) staged.set(item.id, path);
    })
    .catch(() => {})
    .finally(() => {
      inflight.delete(item.id);
    });

  inflight.set(item.id, task);
}

/**
 * The staged path for an item, waiting for a prewarm in flight.
 *
 * This is the fallback for a drag that starts before the prewarm has finished —
 * a fast press-and-drag on a card that just scrolled into view.
 */
export async function ensureStagedDropPath(item: HistoryItem): Promise<string> {
  const hit = staged.get(item.id);
  if (hit) return hit;

  const pending = inflight.get(item.id);
  if (pending) await pending;

  const warmed = staged.get(item.id);
  if (warmed) return warmed;

  const path = await api.stageImageForDrag(item.id);
  if (!path) throw new Error("Image content unavailable");
  staged.set(item.id, path);
  return path;
}

/** Test seam: the module-level maps would otherwise leak between tests. */
export function resetDropStage() {
  staged.clear();
  inflight.clear();
}
