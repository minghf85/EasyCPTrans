import type { HistoryItem } from "../types";

export type Scope = "all" | "pinned" | "text" | "image";

export interface FilterState {
  search: string;
  scope: Scope;
  activeTags: string[];
}

export const emptyFilter = (): FilterState => ({
  search: "",
  scope: "all",
  activeTags: [],
});

export const isFilterActive = (f: FilterState): boolean =>
  f.search.trim() !== "" || f.scope !== "all" || f.activeTags.length > 0;

/**
 * Pure filter — keeps List rendering decoupled from filter logic so it's easy
 * to add new filter dimensions (e.g. metadata-based) later without touching UI.
 */
export function applyFilters(
  items: HistoryItem[],
  filter: FilterState,
): HistoryItem[] {
  const q = filter.search.trim().toLowerCase();
  const tagSet = new Set(filter.activeTags.map((t) => t.toLowerCase()));

  return items.filter((item) => {
    if (filter.scope === "pinned" && !item.pinned) return false;
    if (filter.scope === "text" && item.contentType !== "text") return false;
    if (filter.scope === "image" && item.contentType !== "image") return false;

    if (tagSet.size > 0) {
      const itemTags = item.tags.map((t) => t.toLowerCase());
      for (const t of tagSet) {
        if (!itemTags.includes(t)) return false;
      }
    }

    if (q) {
      const inContent = item.content.toLowerCase().includes(q);
      const inTags = item.tags.some((t) => t.toLowerCase().includes(q));
      const inMetadata = Object.values(item.metadata)
        .flat()
        .some((v) => v.toLowerCase().includes(q));
      if (!inContent && !inTags && !inMetadata) return false;
    }

    return true;
  });
}

/** Aggregate tags across history with counts, sorted by frequency desc. */
export function aggregateTags(
  items: HistoryItem[],
): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    for (const t of item.tags) {
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
