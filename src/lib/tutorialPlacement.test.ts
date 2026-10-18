import { describe, expect, it } from "vitest";
import {
  TOUR_GAP,
  TOUR_MARGIN,
  isVisibleRect,
  placeTooltip,
  sameRect,
} from "./tutorialPlacement";

const viewport = { width: 1000, height: 800 };
const tooltip = { width: 300, height: 180 };

describe("placeTooltip", () => {
  it("puts the tooltip below a target that has room", () => {
    const placement = placeTooltip(
      { left: 400, top: 200, width: 200, height: 100 },
      tooltip,
      viewport,
      "bottom",
    );

    expect(placement.side).toBe("bottom");
    expect(placement.left).toBe(350);
    expect(placement.top).toBe(200 + 100 + TOUR_GAP);
    expect(placement.arrowOffset).toBe(150);
  });

  it("flips to the opposite side when the preferred side has no room", () => {
    const placement = placeTooltip(
      { left: 400, top: 650, width: 200, height: 100 },
      tooltip,
      viewport,
      "bottom",
    );

    expect(placement.side).toBe("top");
    expect(placement.top).toBe(650 - TOUR_GAP - tooltip.height);
    expect(placement.left).toBe(350);
  });

  it("clamps horizontally and keeps the arrow inside the tooltip", () => {
    const placement = placeTooltip(
      { left: 0, top: 200, width: 100, height: 100 },
      tooltip,
      viewport,
      "bottom",
    );

    expect(placement.left).toBe(TOUR_MARGIN);
    expect(placement.arrowOffset).toBeGreaterThanOrEqual(20);
    expect(placement.arrowOffset).toBeLessThanOrEqual(tooltip.width - 20);
  });

  it("places the tooltip beside a target when asked", () => {
    const placement = placeTooltip(
      { left: 100, top: 300, width: 100, height: 100 },
      { width: 200, height: 150 },
      viewport,
      "right",
    );

    expect(placement.side).toBe("right");
    expect(placement.left).toBe(100 + 100 + TOUR_GAP);
    expect(placement.top).toBe(300 + 50 - 75);
  });

  it("centers when there is no target", () => {
    const placement = placeTooltip(null, tooltip, viewport);

    expect(placement).toEqual({
      left: 350,
      top: 310,
      side: "center",
      arrowOffset: null,
    });
  });

  it("centers when the caller asks for it", () => {
    const placement = placeTooltip(
      { left: 400, top: 200, width: 200, height: 100 },
      tooltip,
      viewport,
      "center",
    );

    expect(placement.side).toBe("center");
    expect(placement.left).toBe(350);
  });

  it("ignores a zero-sized rectangle", () => {
    const placement = placeTooltip(
      { left: 400, top: 200, width: 0, height: 0 },
      tooltip,
      viewport,
    );

    expect(placement.side).toBe("center");
  });

  it("still returns an on-screen position when nothing fits", () => {
    const placement = placeTooltip(
      { left: 150, top: 150, width: 100, height: 100 },
      { width: 360, height: 280 },
      { width: 400, height: 300 },
    );

    expect(placement.left).toBeGreaterThanOrEqual(TOUR_MARGIN);
    expect(placement.top).toBeGreaterThanOrEqual(TOUR_MARGIN);
  });
});

describe("isVisibleRect", () => {
  it("rejects null and collapsed rectangles", () => {
    expect(isVisibleRect(null)).toBe(false);
    expect(isVisibleRect({ left: 0, top: 0, width: 0, height: 10 })).toBe(false);
    expect(isVisibleRect({ left: 0, top: 0, width: 10, height: 10 })).toBe(true);
  });
});

describe("sameRect", () => {
  it("treats sub-pixel jitter as unchanged", () => {
    const a = { left: 10, top: 10, width: 100, height: 40 };
    expect(sameRect(a, { ...a, left: 10.2 })).toBe(true);
    expect(sameRect(a, { ...a, left: 14 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(a, null)).toBe(false);
  });
});
