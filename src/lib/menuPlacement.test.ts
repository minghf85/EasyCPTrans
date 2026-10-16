import { describe, expect, it } from "vitest";
import { MENU_MARGIN, placeMenu, type MenuAnchor, type Viewport } from "./menuPlacement";

const viewport: Viewport = { width: 1000, height: 800 };
const popup = { width: 220, height: 260 };

const anchorAt = (x: number, y: number): MenuAnchor => ({ x, y, ...popup });

describe("placeMenu", () => {
  it("opens down and to the right when there is room", () => {
    expect(placeMenu(anchorAt(100, 100), viewport)).toEqual({
      left: 100,
      top: 100,
      openLeft: false,
      openUp: false,
    });
  });

  it("flips to the left when the right edge is too close", () => {
    const placement = placeMenu(anchorAt(950, 100), viewport);

    expect(placement.openLeft).toBe(true);
    expect(placement.left).toBe(950 - popup.width);
  });

  it("flips upwards when the bottom edge is too close", () => {
    const placement = placeMenu(anchorAt(100, 780), viewport);

    expect(placement.openUp).toBe(true);
    expect(placement.top).toBe(780 - popup.height);
  });

  it("flips on both axes in the bottom right corner", () => {
    // Flipping is not enough on its own: the flipped position still overshoots
    // the margin here, so the popup is pulled back inside it.
    expect(placeMenu(anchorAt(999, 799), viewport)).toEqual({
      left: viewport.width - popup.width - MENU_MARGIN,
      top: viewport.height - popup.height - MENU_MARGIN,
      openLeft: true,
      openUp: true,
    });
  });

  it("flips without clamping when the flipped position still fits", () => {
    // A pointer one pixel past the margin line: flipping lands inside it.
    const placement = placeMenu(anchorAt(790, 550), viewport);

    expect(placement).toEqual({
      left: 790 - popup.width,
      top: 550 - popup.height,
      openLeft: true,
      openUp: true,
    });
  });

  it("treats the margin as exclusive", () => {
    // Room for the popup plus exactly the margin is still "room".
    const placement = placeMenu(anchorAt(viewport.width - popup.width - MENU_MARGIN, 100), viewport);

    expect(placement.openLeft).toBe(false);
    expect(placement.left).toBe(viewport.width - popup.width - MENU_MARGIN);
  });

  it("keeps the popup inside the viewport when the pointer is at the origin", () => {
    expect(placeMenu(anchorAt(0, 0), viewport)).toMatchObject({
      left: MENU_MARGIN,
      top: MENU_MARGIN,
    });
  });

  it("pins a popup that is larger than the viewport to the near edge", () => {
    const huge = { width: 1200, height: 900 };
    const placement = placeMenu({ x: 20, y: 20, ...huge }, viewport);

    expect(placement.left).toBe(MENU_MARGIN);
    expect(placement.top).toBe(MENU_MARGIN);
  });

  it("agrees with its own flags once clamped", () => {
    // A pointer near the middle of a narrow viewport: the popup fits neither way
    // round, so it is clamped rather than flung off screen.
    const narrow: Viewport = { width: 300, height: 400 };
    const placement = placeMenu(anchorAt(150, 200), narrow);

    expect(placement.left).toBeGreaterThanOrEqual(MENU_MARGIN);
    expect(placement.left + popup.width).toBeLessThanOrEqual(narrow.width - MENU_MARGIN);
    expect(placement.top).toBeGreaterThanOrEqual(MENU_MARGIN);
    expect(placement.top + popup.height).toBeLessThanOrEqual(narrow.height - MENU_MARGIN);
  });

  it("honours a custom margin", () => {
    expect(placeMenu(anchorAt(0, 0), viewport, 24)).toMatchObject({ left: 24, top: 24 });
  });
});
