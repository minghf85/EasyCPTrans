/**
 * Where a popup goes, given where the pointer was and how big the popup turned
 * out to be.
 *
 * Popups are measured after they are laid out, so this runs on real numbers
 * rather than on a guess. Flipping comes before clamping: a menu that opens
 * upwards from the cursor keeps its relationship with the click, while one that
 * has merely been pushed back into the viewport can end up far from it.
 */

/** Gap kept between the popup and the edge of the viewport. */
export const MENU_MARGIN = 8;

export interface MenuAnchor {
  /** Pointer position, in viewport CSS pixels. */
  x: number;
  y: number;
  /** Measured size of the popup. */
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface MenuPlacement {
  left: number;
  top: number;
  /** The popup was placed to the left of the pointer. */
  openLeft: boolean;
  /** The popup was placed above the pointer. */
  openUp: boolean;
}

function clamp(value: number, min: number, max: number): number {
  // A popup larger than the viewport has no valid range; pinning it to the near
  // edge at least keeps its first item reachable.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function placeMenu(
  anchor: MenuAnchor,
  viewport: Viewport,
  margin = MENU_MARGIN,
): MenuPlacement {
  const openLeft = anchor.x + anchor.width > viewport.width - margin;
  const openUp = anchor.y + anchor.height > viewport.height - margin;

  const preferredLeft = openLeft ? anchor.x - anchor.width : anchor.x;
  const preferredTop = openUp ? anchor.y - anchor.height : anchor.y;

  return {
    left: clamp(preferredLeft, margin, viewport.width - anchor.width - margin),
    top: clamp(preferredTop, margin, viewport.height - anchor.height - margin),
    openLeft,
    openUp,
  };
}
