import { describe, expect, it } from "vitest";
import { fitInside } from "./imageThumbnail";

describe("fitInside", () => {
  it("scales a landscape image by its longest edge", () => {
    expect(fitInside(1920, 1080, 640)).toEqual({ width: 640, height: 360 });
  });

  it("scales a portrait image by its longest edge", () => {
    expect(fitInside(1080, 1920, 640)).toEqual({ width: 360, height: 640 });
  });

  it("leaves an image that already fits untouched", () => {
    expect(fitInside(320, 200, 640)).toBeNull();
    expect(fitInside(640, 360, 640)).toBeNull();
  });

  it("never returns a zero dimension", () => {
    expect(fitInside(10000, 1, 640)).toEqual({ width: 640, height: 1 });
    expect(fitInside(1, 10000, 640)).toEqual({ width: 1, height: 640 });
  });

  it("rejects unusable dimensions instead of throwing", () => {
    expect(fitInside(0, 100, 640)).toBeNull();
    expect(fitInside(100, 0, 640)).toBeNull();
    expect(fitInside(-1, 100, 640)).toBeNull();
    expect(fitInside(Number.NaN, 100, 640)).toBeNull();
    expect(fitInside(100, 100, 0)).toBeNull();
  });
});
