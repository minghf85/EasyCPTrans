/**
 * The pointer gesture that starts a native drag-out.
 *
 * Windows itself only begins a drag after the pointer has moved a few pixels
 * (`SM_CXDRAG`), and the same rule matters here for a second reason: the drag
 * loop is entered through an async IPC hop, so a drag started on a plain click
 * reaches `DoDragDrop` after the button is already up — the drop then resolves
 * against whatever is under the cursor, which is usually the panel itself.
 */

/** Slightly above the Windows default of 4px, to absorb a shaky hand. */
export const DRAG_THRESHOLD_PX = 5;

export interface Point {
  x: number;
  y: number;
}

/** True once the pointer has travelled far enough to mean "drag", not "click". */
export function exceedsDragThreshold(
  origin: Point,
  current: Point,
  threshold = DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(current.x - origin.x, current.y - origin.y) >= threshold;
}
