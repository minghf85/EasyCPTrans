import { describe, expect, it } from "vitest";
import { shouldHideOnBlur, type BlurHideInput } from "./windowFocus";

const blur = (overrides: Partial<BlurHideInput> = {}): BlurHideInput => ({
  alwaysOnTop: false,
  edgeInteracting: false,
  suppressedUntil: 0,
  now: 1_000,
  ...overrides,
});

describe("shouldHideOnBlur", () => {
  it("hides an ordinary panel that lost focus", () => {
    expect(shouldHideOnBlur(blur())).toBe(true);
  });

  it("keeps a pinned panel on screen", () => {
    // Pinning means "stay where I can see you", so losing focus must not take
    // the panel away — this used to be ignored and the panel vanished anyway.
    expect(shouldHideOnBlur(blur({ alwaysOnTop: true }))).toBe(false);
  });

  it("waits out an in-flight window drag or drag-out", () => {
    expect(shouldHideOnBlur(blur({ edgeInteracting: true }))).toBe(false);
  });

  it("respects a transient interaction window", () => {
    expect(shouldHideOnBlur(blur({ suppressedUntil: 2_000 }))).toBe(false);
    expect(shouldHideOnBlur(blur({ suppressedUntil: 500 }))).toBe(true);
  });

  it("treats the suppression deadline as exclusive", () => {
    expect(shouldHideOnBlur(blur({ suppressedUntil: 1_000 }))).toBe(true);
  });

  it("keeps a pinned panel even while a drag is in flight", () => {
    expect(
      shouldHideOnBlur(blur({ alwaysOnTop: true, edgeInteracting: true, suppressedUntil: 2_000 })),
    ).toBe(false);
  });
});
