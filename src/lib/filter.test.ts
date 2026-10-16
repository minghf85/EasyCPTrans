import { afterEach, describe, expect, it, vi } from "vitest";
import { localIso, makeItem } from "../test/items";
import type { HistoryItem } from "../types";
import {
  aggregateTags,
  applyFilters,
  describeSearchQuery,
  emptyFilter,
  isFilterActive,
  type FilterState,
} from "./filter";

const filterOf = (patch: Partial<FilterState> = {}): FilterState => ({
  ...emptyFilter(),
  ...patch,
});

const idList = (items: HistoryItem[]) => items.map((item) => item.id);

/** A small deck covering every content type the filters branch on. */
const deck: HistoryItem[] = [
  makeItem({ id: 1, content: "hello world", tags: ["Work"], metadata: {} }),
  makeItem({
    id: 2,
    content: "const x = () => 1;",
    tags: ["Work", "Urgent"],
    metadata: { language: ["typescript"], length: ["19"] },
  }),
  makeItem({
    id: 3,
    content: "https://example.com/docs",
    tags: [],
    metadata: { length: ["24"] },
  }),
  makeItem({
    id: 4,
    contentType: "image",
    content: "data:image/png;base64,AAAA",
    tags: ["Screenshot"],
    metadata: { width: ["800"], height: ["600"], size: ["2000000"], length: ["500"] },
  }),
  makeItem({
    id: 5,
    contentType: "file",
    content: "C:\\tmp\\report.pdf",
    tags: ["Work"],
    metadata: { totalSize: ["1000"], lengths: ["20"] },
  }),
  makeItem({ id: 6, content: "pinned note", pinned: true, tags: [] }),
  makeItem({ id: 7, content: "secret note", isPrivate: true, tags: [] }),
];

afterEach(() => {
  vi.useRealTimers();
});

describe("emptyFilter", () => {
  it("produces an inactive filter with empty ranges", () => {
    const filter = emptyFilter();
    expect(filter).toEqual({
      search: "",
      scope: "all",
      activeTags: [],
      timeRange: [null, null],
      textLen: [null, null],
      fileSize: [null, null],
    });
    expect(isFilterActive(filter)).toBe(false);
  });
});

describe("isFilterActive", () => {
  it("ignores whitespace-only search", () => {
    expect(isFilterActive(filterOf({ search: "   " }))).toBe(false);
  });

  it("activates on any single dimension", () => {
    expect(isFilterActive(filterOf({ search: "x" }))).toBe(true);
    expect(isFilterActive(filterOf({ scope: "text" }))).toBe(true);
    expect(isFilterActive(filterOf({ activeTags: ["work"] }))).toBe(true);
    expect(isFilterActive(filterOf({ timeRange: [0, null] }))).toBe(true);
    expect(isFilterActive(filterOf({ timeRange: [null, 0] }))).toBe(true);
    expect(isFilterActive(filterOf({ textLen: [1, null] }))).toBe(true);
    expect(isFilterActive(filterOf({ fileSize: [null, 1024] }))).toBe(true);
  });

  it("stays inactive when every range bound is null", () => {
    expect(
      isFilterActive(filterOf({ timeRange: [null, null], textLen: [null, null], fileSize: [null, null] })),
    ).toBe(false);
  });
});

describe("describeSearchQuery", () => {
  it("returns nothing for an empty query", () => {
    expect(describeSearchQuery("")).toEqual([]);
    expect(describeSearchQuery("   ")).toEqual([]);
  });

  it("splits field filters into their own chips", () => {
    expect(describeSearchQuery("tag:work app:chrome")).toEqual(["tag:work", "app:chrome"]);
    expect(describeSearchQuery("type:text type:image")).toEqual(["type:text", "type:image"]);
  });

  it("reads a leading # as a tag filter", () => {
    expect(describeSearchQuery("#work")).toEqual(["tag:work"]);
    expect(describeSearchQuery("-#work")).toEqual(["not tag:work"]);
  });

  it("keeps quoted phrases as one phrase chip", () => {
    expect(describeSearchQuery('"exact phrase"')).toEqual(['"exact phrase"']);
    expect(describeSearchQuery('draft "exact phrase"')).toEqual(["draft", '"exact phrase"']);
  });

  it("marks excluded terms", () => {
    expect(describeSearchQuery("-draft")).toEqual(["not draft"]);
    expect(describeSearchQuery("-tag:work")).toEqual(["not tag:work"]);
  });

  it("treats a doubled minus as an include again", () => {
    expect(describeSearchQuery("--draft")).toEqual(["draft"]);
  });

  it("reads the is: flags", () => {
    expect(describeSearchQuery("is:pinned")).toEqual(["pinned"]);
    expect(describeSearchQuery("is:private")).toEqual(["private"]);
    expect(describeSearchQuery("is:public")).toEqual(["public"]);
    expect(describeSearchQuery("-is:pinned")).toEqual(["not pinned"]);
  });

  it("keeps numeric and byte ranges", () => {
    expect(describeSearchQuery("len:>120 size:<5mb")).toEqual(["len:>120", "size:<5mb"]);
    expect(describeSearchQuery("len:<=50")).toEqual(["len:<=50"]);
  });

  it("keeps absolute date filters and ranges", () => {
    expect(describeSearchQuery("after:2026-07-01 before:2026-07-25")).toEqual([
      "after:2026-07-01",
      "before:2026-07-25",
    ]);
    expect(describeSearchQuery("date:2026-07-01..2026-07-25")).toEqual([
      "date:2026-07-01..2026-07-25",
    ]);
    expect(describeSearchQuery("time:2026-07-25T09:00..2026-07-25T18:30")).toEqual([
      "time:2026-07-25T09:00..2026-07-25T18:30",
    ]);
  });

  it("falls back to a plain term when a field value is unparseable", () => {
    // Documented behaviour: an unusable value degrades to a literal text search
    // rather than being silently dropped.
    expect(describeSearchQuery("after:notadate")).toEqual(["after:notadate"]);
    expect(describeSearchQuery("len:abc")).toEqual(["len:abc"]);
    expect(describeSearchQuery("size:big")).toEqual(["size:big"]);
    expect(describeSearchQuery("date:2026-13-45..")).toEqual(["date:2026-13-45.."]);
  });
});

describe("applyFilters — scope", () => {
  it("returns every item for the all scope", () => {
    expect(idList(applyFilters(deck, filterOf()))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("filters by pinned", () => {
    expect(idList(applyFilters(deck, filterOf({ scope: "pinned" })))).toEqual([6]);
  });

  it("filters by content type", () => {
    expect(idList(applyFilters(deck, filterOf({ scope: "text" })))).toEqual([1, 2, 3, 6, 7]);
    expect(idList(applyFilters(deck, filterOf({ scope: "image" })))).toEqual([4]);
    expect(idList(applyFilters(deck, filterOf({ scope: "file" })))).toEqual([5]);
  });

  it("matches the url scope on content, not on content type", () => {
    expect(idList(applyFilters(deck, filterOf({ scope: "url" })))).toEqual([3]);
  });

  it("matches the code scope on metadata.language or a code-looking app", () => {
    expect(idList(applyFilters(deck, filterOf({ scope: "code" })))).toEqual([2]);

    const fromIde = makeItem({
      id: 10,
      content: "plain words",
      metadata: { sourceApp: ["main.rs - Visual Studio Code"] },
    });
    expect(idList(applyFilters([fromIde], filterOf({ scope: "code" })))).toEqual([10]);

    const bracey = makeItem({ id: 11, content: "a => b; }" });
    expect(idList(applyFilters([bracey], filterOf({ scope: "code" })))).toEqual([11]);
  });

  it("does not treat markup-free prose as code", () => {
    const prose = makeItem({ id: 12, content: "the quick brown fox jumps over the lazy dog" });
    expect(applyFilters([prose], filterOf({ scope: "code" }))).toEqual([]);
  });
});

describe("applyFilters — selected tags", () => {
  it("matches tag names case-insensitively", () => {
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["work"] })))).toEqual([1, 2, 5]);
  });

  it("requires every selected tag (AND, not OR)", () => {
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["work", "urgent"] })))).toEqual([2]);
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["work", "missing"] })))).toEqual([]);
  });

  it("maps the reserved text/image/file names onto the content type", () => {
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["text"] })))).toEqual([1, 2, 3, 6, 7]);
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["Image"] })))).toEqual([4]);
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["file"] })))).toEqual([5]);
  });

  it("maps the reserved pinned/private names onto the item flags", () => {
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["pinned"] })))).toEqual([6]);
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["private"] })))).toEqual([7]);
  });

  it("ignores a blank tag instead of matching nothing", () => {
    expect(idList(applyFilters(deck, filterOf({ activeTags: ["  "] })))).toHaveLength(deck.length);
  });
});

describe("applyFilters — advanced ranges", () => {
  it("drops items before the time range start", () => {
    const filter = filterOf({ timeRange: [new Date(2026, 6, 10).getTime(), null] });
    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 7, 5) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 20) }),
    ];
    expect(idList(applyFilters(items, filter))).toEqual([2]);
  });

  it("includes the whole end day of the time range", () => {
    const filter = filterOf({ timeRange: [null, new Date(2026, 6, 20).getTime()] });
    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 7, 20, 23, 59) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 21, 6, 0) }),
    ];
    expect(idList(applyFilters(items, filter))).toEqual([1]);
  });

  it("keeps an item with no timestamp when only a range is set", () => {
    const filter = filterOf({ timeRange: [new Date(2026, 6, 10).getTime(), null] });
    const undated = makeItem({ id: 1, createdAt: null, lastUsedAt: null });
    expect(idList(applyFilters([undated], filter))).toEqual([1]);
  });

  it("applies textLen to text items only", () => {
    const filter = filterOf({ textLen: [10, null] });
    const items = [
      makeItem({ id: 1, content: "short" }),
      makeItem({ id: 2, content: "a much longer piece of text" }),
      makeItem({ id: 3, contentType: "image", content: "x", metadata: {} }),
    ];
    expect(idList(applyFilters(items, filter))).toEqual([2, 3]);
  });

  it("applies fileSize to file items only", () => {
    const filter = filterOf({ fileSize: [500, null] });
    const items = [
      makeItem({ id: 1, contentType: "file", content: "a.txt", metadata: { size: ["100"] } }),
      makeItem({ id: 2, contentType: "file", content: "b.txt", metadata: { size: ["900"] } }),
      makeItem({ id: 3, contentType: "text", content: "x", metadata: {} }),
    ];
    expect(idList(applyFilters(items, filter))).toEqual([2, 3]);
  });
});

describe("applyFilters — search", () => {
  it("reads the is: flags", () => {
    expect(idList(applyFilters(deck, filterOf({ search: "is:pinned" })))).toEqual([6]);
    expect(idList(applyFilters(deck, filterOf({ search: "is:private" })))).toEqual([7]);
    expect(
      idList(applyFilters(deck, filterOf({ search: "is:public" }))),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(idList(applyFilters(deck, filterOf({ search: "-is:pinned" })))).toEqual([
      1, 2, 3, 4, 5, 7,
    ]);
  });

  it("matches free terms across content, source app, metadata and tags", () => {
    const item = makeItem({
      id: 1,
      content: "run the report",
      tags: ["Work"],
      metadata: { sourceApp: ["notes.txt - Notepad"], language: ["rust"] },
    });
    expect(idList(applyFilters([item], filterOf({ search: "report" })))).toEqual([1]);
    expect(idList(applyFilters([item], filterOf({ search: "notepad" })))).toEqual([1]);
    expect(idList(applyFilters([item], filterOf({ search: "work" })))).toEqual([1]);
    expect(idList(applyFilters([item], filterOf({ search: "rust" })))).toEqual([1]);
    expect(applyFilters([item], filterOf({ search: "absent" }))).toEqual([]);
  });

  it("requires every included term", () => {
    const item = makeItem({ id: 1, content: "alpha beta" });
    expect(idList(applyFilters([item], filterOf({ search: "alpha beta" })))).toEqual([1]);
    expect(applyFilters([item], filterOf({ search: "alpha gamma" }))).toEqual([]);
  });

  it("lets an exclude beat an include", () => {
    const item = makeItem({ id: 1, content: "alpha beta" });
    expect(applyFilters([item], filterOf({ search: "alpha -beta" }))).toEqual([]);
    expect(idList(applyFilters([item], filterOf({ search: "alpha -gamma" })))).toEqual([1]);
  });

  it("matches quoted phrases as one unit", () => {
    const item = makeItem({ id: 1, content: "the exact phrase here" });
    expect(idList(applyFilters([item], filterOf({ search: '"exact phrase"' })))).toEqual([1]);
    expect(applyFilters([item], filterOf({ search: '"phrase exact"' }))).toEqual([]);
  });

  it("searches case-insensitively", () => {
    const item = makeItem({ id: 1, content: "Mixed Case Content" });
    expect(idList(applyFilters([item], filterOf({ search: "mixed case" })))).toEqual([1]);
  });

  it("filters by type:, including the url and code aliases", () => {
    expect(idList(applyFilters(deck, filterOf({ search: "type:image" })))).toEqual([4]);
    expect(idList(applyFilters(deck, filterOf({ search: "type:url" })))).toEqual([3]);
    expect(idList(applyFilters(deck, filterOf({ search: "type:code" })))).toEqual([2]);
  });

  it("matches nothing for an unknown type", () => {
    expect(applyFilters(deck, filterOf({ search: "type:bogus" }))).toEqual([]);
  });

  it("supports negated type:, tag: and app: filters", () => {
    expect(idList(applyFilters(deck, filterOf({ search: "-type:image" })))).toEqual([
      1, 2, 3, 5, 6, 7,
    ]);
    expect(idList(applyFilters(deck, filterOf({ search: "-tag:work" })))).toEqual([3, 4, 6, 7]);
  });

  it("filters by app:", () => {
    const chrome = makeItem({ id: 1, content: "x", metadata: { sourceApp: ["Tab - Google Chrome"] } });
    const notepad = makeItem({ id: 2, content: "y", metadata: { sourceApp: ["a.txt - Notepad"] } });
    expect(idList(applyFilters([chrome, notepad], filterOf({ search: "app:chrome" })))).toEqual([1]);
    expect(idList(applyFilters([chrome, notepad], filterOf({ search: "-app:chrome" })))).toEqual([2]);
  });

  it("filters by tag: on the item's tag list, not on free text", () => {
    expect(idList(applyFilters(deck, filterOf({ search: "tag:work" })))).toEqual([1, 2, 5]);
    expect(idList(applyFilters(deck, filterOf({ search: "tag:Screenshot" })))).toEqual([4]);
  });

  it("applies len: to every content type, unlike the advanced textLen", () => {
    // The query form is not gated on content type: it reads `metadata.length`
    // when present and falls back to the content length otherwise.
    expect(idList(applyFilters(deck, filterOf({ search: "len:>120" })))).toEqual([4]);
    expect(idList(applyFilters(deck, filterOf({ search: "len:<100" })))).toEqual([
      1, 2, 3, 5, 6, 7,
    ]);
  });

  it("applies size: to every content type", () => {
    expect(idList(applyFilters(deck, filterOf({ search: "size:>1mb" })))).toEqual([4]);
    expect(idList(applyFilters(deck, filterOf({ search: "size:<2kb" })))).toEqual([
      1, 2, 3, 5, 6, 7,
    ]);
  });

  it("reads byte suffixes case-insensitively", () => {
    const big = makeItem({ id: 1, contentType: "file", content: "a", metadata: { size: ["6000000"] } });
    expect(idList(applyFilters([big], filterOf({ search: "size:>1MB" })))).toEqual([1]);
    expect(applyFilters([big], filterOf({ search: "size:>10mb" }))).toEqual([]);
  });

  it("lets an unparseable length metadata pass instead of filtering the item out", () => {
    // Documented behaviour: `parseInt` yields NaN, every NaN comparison is
    // false, so the item survives. Lenient by accident, but it never hides data.
    const odd = makeItem({ id: 1, metadata: { length: ["unknown"] } });
    expect(idList(applyFilters([odd], filterOf({ search: "len:>5" })))).toEqual([1]);
  });

  it("intersects repeated bounds", () => {
    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 6, 20) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 10) }),
      makeItem({ id: 3, createdAt: localIso(2026, 8, 20) }),
    ];
    expect(
      idList(applyFilters(items, filterOf({ search: "after:2026-07-01 before:2026-08-01" }))),
    ).toEqual([2]);
    // Two lower bounds keep the later one, two upper bounds keep the earlier one.
    expect(
      idList(applyFilters(items, filterOf({ search: "after:2026-06-01 after:2026-07-01" }))),
    ).toEqual([2, 3]);
    expect(
      idList(applyFilters(items, filterOf({ search: "before:2026-09-01 before:2026-08-01" }))),
    ).toEqual([1, 2]);
  });

  it("covers a whole day for a bare date in a range", () => {
    // Fixtures sit at least two days away from either bound: a bare date is
    // parsed as a local-time instant, so only wide margins stay timezone-safe.
    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 7, 5, 12, 0) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 15, 12, 0) }),
      makeItem({ id: 3, createdAt: localIso(2026, 7, 23, 12, 0) }),
      makeItem({ id: 4, createdAt: localIso(2026, 7, 30, 12, 0) }),
    ];
    expect(
      idList(applyFilters(items, filterOf({ search: "date:2026-07-10..2026-07-25" }))),
    ).toEqual([2, 3]);
  });

  it("bounds a single bare date on both sides", () => {
    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 7, 13, 12, 0) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 15, 12, 0) }),
      makeItem({ id: 3, createdAt: localIso(2026, 7, 17, 12, 0) }),
    ];
    expect(idList(applyFilters(items, filterOf({ search: "date:2026-07-15" })))).toEqual([2]);
  });

  it("treats an open-ended range as a single bound", () => {
    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 6, 20) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 10) }),
    ];
    expect(idList(applyFilters(items, filterOf({ search: "date:2026-07-01.." })))).toEqual([2]);
    expect(idList(applyFilters(items, filterOf({ search: "date:..2026-07-01" })))).toEqual([1]);
  });

  it("honours exact times when the value spells them out", () => {
    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 7, 25, 8, 0) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 25, 12, 0) }),
      makeItem({ id: 3, createdAt: localIso(2026, 7, 25, 20, 0) }),
    ];
    expect(
      idList(
        applyFilters(items, filterOf({ search: "time:2026-07-25T09:00..2026-07-25T18:30" })),
      ),
    ).toEqual([2]);
  });

  it("drops an undated item from a date search, unlike an advanced range", () => {
    const undated = makeItem({ id: 1, createdAt: null, lastUsedAt: null });
    expect(applyFilters([undated], filterOf({ search: "after:2026-07-01" }))).toEqual([]);
    expect(idList(applyFilters([undated], filterOf({ timeRange: [new Date(2026, 6, 1).getTime(), null] })))).toEqual([1]);
  });

  it("supports the today, yesterday and relative-day shorthands", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 14, 0));

    const items = [
      makeItem({ id: 1, createdAt: localIso(2026, 7, 15, 9, 0) }),
      makeItem({ id: 2, createdAt: localIso(2026, 7, 14, 9, 0) }),
      makeItem({ id: 3, createdAt: localIso(2026, 7, 10, 9, 0) }),
      makeItem({ id: 4, createdAt: localIso(2026, 7, 1, 9, 0) }),
    ];

    expect(idList(applyFilters(items, filterOf({ search: "after:today" })))).toEqual([1]);
    expect(idList(applyFilters(items, filterOf({ search: "date:today" })))).toEqual([1]);
    expect(idList(applyFilters(items, filterOf({ search: "date:yesterday" })))).toEqual([2]);
    expect(idList(applyFilters(items, filterOf({ search: "after:7d" })))).toEqual([1, 2, 3]);
    expect(idList(applyFilters(items, filterOf({ search: "since:7d" })))).toEqual([1, 2, 3]);
  });
});

describe("aggregateTags", () => {
  it("counts occurrences and sorts by count then name", () => {
    expect(
      aggregateTags([
        makeItem({ id: 1, tags: ["Work", "Urgent"] }),
        makeItem({ id: 2, tags: ["Work"] }),
        makeItem({ id: 3, tags: ["Zeta", "Alpha"] }),
      ]),
    ).toEqual([
      { tag: "Work", count: 2 },
      { tag: "Alpha", count: 1 },
      { tag: "Urgent", count: 1 },
      { tag: "Zeta", count: 1 },
    ]);
  });

  it("returns an empty list when no item carries a tag", () => {
    expect(aggregateTags([makeItem({ id: 1, tags: [] })])).toEqual([]);
  });
});
