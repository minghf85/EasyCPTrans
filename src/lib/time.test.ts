import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatExactTime, formatTime } from "./time";

const BASE = new Date(2026, 6, 15, 12, 0, 0);

const agoBy = (ms: number) => new Date(BASE.getTime() - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatTime", () => {
  it("returns an empty string for a missing timestamp", () => {
    expect(formatTime(null)).toBe("");
  });

  it("returns the raw value when it cannot be parsed", () => {
    expect(formatTime("not a date")).toBe("not a date");
  });

  it("reads a space-separated timestamp as UTC", () => {
    // Stored timestamps come from SQLite without a `T` separator; the parser
    // normalises them and appends `Z`, so they must not be read as local time.
    const sqliteTimestamp = (ms: number) =>
      new Date(ms).toISOString().slice(0, 19).replace("T", " ");

    expect(formatTime(sqliteTimestamp(BASE.getTime() - HOUR))).toBe("1h ago");
  });

  it("collapses anything under ten seconds into 'just now'", () => {
    expect(formatTime(agoBy(0))).toBe("just now");
    expect(formatTime(agoBy(9 * SECOND))).toBe("just now");
    expect(formatTime(agoBy(10 * SECOND))).toBe("10s ago");
  });

  it("clamps a future timestamp to 'just now'", () => {
    expect(formatTime(agoBy(-5 * MINUTE))).toBe("just now");
  });

  it("walks up the second, minute, hour and day buckets", () => {
    expect(formatTime(agoBy(45 * SECOND))).toBe("45s ago");
    expect(formatTime(agoBy(59 * SECOND))).toBe("59s ago");
    expect(formatTime(agoBy(MINUTE))).toBe("1m ago");
    expect(formatTime(agoBy(59 * MINUTE))).toBe("59m ago");
    expect(formatTime(agoBy(HOUR))).toBe("1h ago");
    expect(formatTime(agoBy(23 * HOUR))).toBe("23h ago");
  });

  it("names a single day and counts the rest", () => {
    expect(formatTime(agoBy(DAY + HOUR))).toBe("yesterday");
    expect(formatTime(agoBy(3 * DAY))).toBe("3d ago");
    expect(formatTime(agoBy(6 * DAY))).toBe("6d ago");
  });

  it("walks up the week, month and year buckets", () => {
    expect(formatTime(agoBy(14 * DAY))).toBe("2w ago");
    expect(formatTime(agoBy(34 * DAY))).toBe("4w ago");
    expect(formatTime(agoBy(100 * DAY))).toBe("3mo ago");
    expect(formatTime(agoBy(800 * DAY))).toBe("2y ago");
  });
});

describe("formatExactTime", () => {
  it("returns an empty string for a missing timestamp", () => {
    expect(formatExactTime(null)).toBe("");
  });

  it("returns the raw value when it cannot be parsed", () => {
    expect(formatExactTime("garbage")).toBe("garbage");
  });

  it("renders a parseable timestamp as a local date string", () => {
    const rendered = formatExactTime("2026-07-15T12:00:00Z");
    expect(rendered).toContain("2026");
    expect(rendered).not.toContain("T");
  });
});
