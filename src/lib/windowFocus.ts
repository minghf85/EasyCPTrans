/**
 * When the panel is allowed to hide itself because it lost focus.
 *
 * The panel is a floating window that gets out of the way as soon as the user
 * moves on, but "lost focus" is not on its own a reason to disappear: a pinned
 * panel is supposed to stay, a drag is in flight during a window move or a
 * drag-out, and the window manager reports a blur in the middle of every show.
 */
export interface BlurHideInput {
  /** The user pinned the panel on top; it stays until they unpin it. */
  alwaysOnTop: boolean;
  /** A window drag or a drag-out is in progress. */
  edgeInteracting: boolean;
  /** Hiding stays suppressed until this timestamp (transient interactions). */
  suppressedUntil: number;
  now: number;
}

export function shouldHideOnBlur(input: BlurHideInput): boolean {
  if (input.alwaysOnTop) return false;
  if (input.edgeInteracting) return false;
  if (input.now < input.suppressedUntil) return false;
  return true;
}
