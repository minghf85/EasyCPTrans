import { describe, expect, it } from "vitest";
import { makeItem } from "../test/items";
import { TAG_MATCH_PREFIX, TAG_MATCH_TOTAL_PREFIX, collectTagMatches } from "./tagMatches";

describe("collectTagMatches", () => {
  it("returns nothing without metadata", () => {
    expect(collectTagMatches(makeItem({ metadata: {} }))).toEqual([]);
  });

  it("collects one group per extracted rule", () => {
    const item = makeItem({
      metadata: {
        "tagMatch:Order": ["A-1", "A-2"],
        "tagMatchTotal:Order": ["2"],
        "tagMatch:Ticket": ["T-9"],
        "tagMatchTotal:Ticket": ["7"],
      },
    });
    expect(collectTagMatches(item)).toEqual([
      { tag: "Order", values: ["A-1", "A-2"], total: 2 },
      { tag: "Ticket", values: ["T-9"], total: 7 },
    ]);
  });

  it("falls back to the visible count when the total is missing", () => {
    const item = makeItem({ metadata: { "tagMatch:Order": ["A-1", "A-2", "A-3"] } });
    expect(collectTagMatches(item)).toEqual([{ tag: "Order", values: ["A-1", "A-2", "A-3"], total: 3 }]);
  });

  it("falls back to the visible count when the total is not a number", () => {
    const item = makeItem({
      metadata: { "tagMatch:Order": ["A-1"], "tagMatchTotal:Order": ["many"] },
    });
    expect(collectTagMatches(item)[0].total).toBe(1);
  });

  it("does not mistake a total key for a group", () => {
    // `tagMatchTotal:x` does not start with `tagMatch:` — the 9th character is
    // `T`, not `:`. This guards that the prefixes stay distinguishable.
    expect("tagMatchTotal:x".startsWith(TAG_MATCH_PREFIX)).toBe(false);
    expect(`${TAG_MATCH_TOTAL_PREFIX}x`.startsWith(TAG_MATCH_PREFIX)).toBe(false);

    const item = makeItem({ metadata: { "tagMatchTotal:Order": ["5"] } });
    expect(collectTagMatches(item)).toEqual([]);
  });

  it("keeps a total that exceeds the stored matches", () => {
    const item = makeItem({
      metadata: { "tagMatch:Path": ["C:\\a.pdf"], "tagMatchTotal:Path": ["137"] },
    });
    expect(collectTagMatches(item)).toEqual([{ tag: "Path", values: ["C:\\a.pdf"], total: 137 }]);
  });

  it("skips empty tags and empty value lists", () => {
    const item = makeItem({
      metadata: {
        "tagMatch:": ["orphan"],
        "tagMatch:Empty": [],
        "tagMatch:Real": ["v"],
      },
    });
    expect(collectTagMatches(item)).toEqual([{ tag: "Real", values: ["v"], total: 1 }]);
  });

  it("ignores unrelated metadata", () => {
    const item = makeItem({
      metadata: { sourceApp: ["a.txt - Notepad"], language: ["rust"], tagMatchOther: ["x"] },
    });
    expect(collectTagMatches(item)).toEqual([]);
  });

  it("preserves metadata order across groups", () => {
    const item = makeItem({
      metadata: { "tagMatch:B": ["1"], "tagMatch:A": ["2"], "tagMatch:C": ["3"] },
    });
    expect(collectTagMatches(item).map((group) => group.tag)).toEqual(["B", "A", "C"]);
  });
});
