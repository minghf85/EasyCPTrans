import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD_PX, exceedsDragThreshold } from "./dragGesture";

describe("exceedsDragThreshold", () => {
  const origin = { x: 100, y: 100 };

  it("ignores a pointer that has not moved", () => {
    expect(exceedsDragThreshold(origin, { x: 100, y: 100 })).toBe(false);
  });

  it("ignores a jitter below the threshold", () => {
    expect(exceedsDragThreshold(origin, { x: 103, y: 100 })).toBe(false);
    expect(exceedsDragThreshold(origin, { x: 100, y: 103 })).toBe(false);
  });

  it("accepts movement at or beyond the threshold", () => {
    expect(exceedsDragThreshold(origin, { x: 100 + DRAG_THRESHOLD_PX, y: 100 })).toBe(true);
    expect(exceedsDragThreshold(origin, { x: 140, y: 100 })).toBe(true);
  });

  it("measures distance, not per-axis movement", () => {
    // 3/4/5: a diagonal of exactly the threshold counts, a shorter one does not.
    expect(exceedsDragThreshold(origin, { x: 103, y: 104 })).toBe(true);
    expect(exceedsDragThreshold(origin, { x: 103, y: 103 })).toBe(false);
  });

  it("works in any direction", () => {
    expect(exceedsDragThreshold(origin, { x: 100 - DRAG_THRESHOLD_PX, y: 100 })).toBe(true);
    expect(exceedsDragThreshold(origin, { x: 100, y: 100 - DRAG_THRESHOLD_PX })).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(exceedsDragThreshold(origin, { x: 102, y: 100 }, 2)).toBe(true);
    expect(exceedsDragThreshold(origin, { x: 102, y: 100 }, 10)).toBe(false);
  });
});
