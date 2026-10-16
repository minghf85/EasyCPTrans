import type { HistoryItem } from "../types";

/**
 * `HistoryItem` with neutral defaults, so each test states only the fields it
 * actually exercises. Shared by the `src/lib` suites — it lives outside a
 * `*.test.ts` file so the test runner does not treat it as a suite.
 */
export function makeItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: 1,
    contentType: "text",
    content: "hello world",
    createdAt: "2026-07-15T12:00:00Z",
    lastUsedAt: "2026-07-15T12:00:00Z",
    useCount: 1,
    pinned: false,
    isPrivate: false,
    tags: [],
    metadata: {},
    ...overrides,
  };
}

/**
 * An ISO timestamp for a *local* wall-clock time, round-tripped through UTC.
 *
 * Search values like `after:2026-07-01` are parsed as local time, so fixtures
 * built this way keep the date assertions independent of the machine's timezone.
 */
export function localIso(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}
