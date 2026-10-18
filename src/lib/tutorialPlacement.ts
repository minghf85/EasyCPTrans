/**
 * Where the coaching tooltip goes, relative to the control it is pointing at.
 *
 * The tour highlights a live element, so the tooltip is positioned from measured
 * rectangles rather than from a guess. The rules are the same ones the context
 * menu follows: prefer the requested side, flip to the opposite side when it
 * does not fit, and only then clamp into the viewport. Flipping comes before
 * clamping so the tooltip keeps its relationship with the highlighted control.
 */

export interface TourRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TourSize {
  width: number;
  height: number;
}

export interface TourViewport {
  width: number;
  height: number;
}

export type TourSide = "top" | "bottom" | "left" | "right";
export type TourPlacementSide = TourSide | "center";

export interface TourPlacement {
  left: number;
  top: number;
  side: TourPlacementSide;
  /** Distance from the tooltip's leading edge to the arrow, along its long axis. */
  arrowOffset: number | null;
}

/** Gap between the highlighted rectangle and the tooltip. */
export const TOUR_GAP = 14;
/** Gap kept between the tooltip and the viewport edge. */
export const TOUR_MARGIN = 12;
/** Half the arrow size, used to keep it off the tooltip's rounded corners. */
const ARROW_INSET = 20;

function clamp(value: number, min: number, max: number): number {
  // A tooltip wider than the viewport has no valid range; pinning it to the
  // near edge keeps its left side readable.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function opposite(side: TourSide): TourSide {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

function centered(tooltip: TourSize, viewport: TourViewport): TourPlacement {
  return {
    left: clamp((viewport.width - tooltip.width) / 2, TOUR_MARGIN, viewport.width - tooltip.width - TOUR_MARGIN),
    top: clamp((viewport.height - tooltip.height) / 2, TOUR_MARGIN, viewport.height - tooltip.height - TOUR_MARGIN),
    side: "center",
    arrowOffset: null,
  };
}

function requiredSpace(side: TourSide, tooltip: TourSize): number {
  return side === "top" || side === "bottom" ? tooltip.height : tooltip.width;
}

function availableSpace(
  side: TourSide,
  target: TourRect,
  viewport: TourViewport,
): number {
  if (side === "top") return target.top - TOUR_GAP - TOUR_MARGIN;
  if (side === "bottom") {
    return viewport.height - (target.top + target.height) - TOUR_GAP - TOUR_MARGIN;
  }
  if (side === "left") return target.left - TOUR_GAP - TOUR_MARGIN;
  return viewport.width - (target.left + target.width) - TOUR_GAP - TOUR_MARGIN;
}

function placeOn(
  side: TourSide,
  target: TourRect,
  tooltip: TourSize,
  viewport: TourViewport,
): TourPlacement {
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  if (side === "top" || side === "bottom") {
    const top =
      side === "top"
        ? target.top - TOUR_GAP - tooltip.height
        : target.top + target.height + TOUR_GAP;
    const left = clamp(
      targetCenterX - tooltip.width / 2,
      TOUR_MARGIN,
      viewport.width - tooltip.width - TOUR_MARGIN,
    );
    return {
      left,
      top: clamp(top, TOUR_MARGIN, viewport.height - tooltip.height - TOUR_MARGIN),
      side,
      arrowOffset: clamp(targetCenterX - left, ARROW_INSET, tooltip.width - ARROW_INSET),
    };
  }

  const left =
    side === "left"
      ? target.left - TOUR_GAP - tooltip.width
      : target.left + target.width + TOUR_GAP;
  const top = clamp(
    targetCenterY - tooltip.height / 2,
    TOUR_MARGIN,
    viewport.height - tooltip.height - TOUR_MARGIN,
  );
  return {
    left: clamp(left, TOUR_MARGIN, viewport.width - tooltip.width - TOUR_MARGIN),
    top,
    side,
    arrowOffset: clamp(targetCenterY - top, ARROW_INSET, tooltip.height - ARROW_INSET),
  };
}

function sameRect(a: TourRect | null, b: TourRect | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** True when a sampled rectangle is worth drawing a spotlight around. */
export function isVisibleRect(rect: TourRect | null): rect is TourRect {
  return Boolean(rect && rect.width >= 1 && rect.height >= 1);
}

export { sameRect };

/**
 * Places the tooltip. `target` is the *padded* spotlight rectangle, so the
 * tooltip never overlaps the ring drawn around the control.
 */
export function placeTooltip(
  target: TourRect | null,
  tooltip: TourSize,
  viewport: TourViewport,
  preferred: TourPlacementSide = "bottom",
): TourPlacement {
  if (!isVisibleRect(target) || preferred === "center") {
    return centered(tooltip, viewport);
  }

  const candidates: TourSide[] = [preferred];
  const flipped = opposite(preferred);
  if (!candidates.includes(flipped)) candidates.push(flipped);
  for (const side of ["bottom", "top", "left", "right"] as TourSide[]) {
    if (!candidates.includes(side)) candidates.push(side);
  }

  const fitting = candidates.find(
    (side) => availableSpace(side, target, viewport) >= requiredSpace(side, tooltip),
  );

  if (fitting) return placeOn(fitting, target, tooltip, viewport);

  // Nothing fits (usually a tooltip taller than the window). Pick the side with
  // the most slack and let `placeOn` clamp it: overlapping the control is better
  // than rendering the card off-screen.
  const roomiest = candidates.reduce((best, side) =>
    availableSpace(side, target, viewport) - requiredSpace(side, tooltip) >
    availableSpace(best, target, viewport) - requiredSpace(best, tooltip)
      ? side
      : best,
  );
  return placeOn(roomiest, target, tooltip, viewport);
}
