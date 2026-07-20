import type { HistoryItem } from "../types";

export type Scope = "all" | "pinned" | "text" | "image" | "file" | "url" | "code";

export interface FilterState {
  search: string;
  scope: Scope;
  activeTags: string[];
  timeRange?: [number | null, number | null];
  textLen?: [number | null, number | null];
  fileSize?: [number | null, number | null];
}

export const emptyFilter = (): FilterState => ({
  search: "",
  scope: "all",
  activeTags: [],
  timeRange: [null, null],
  textLen: [null, null],
  fileSize: [null, null],
});

export const isFilterActive = (f: FilterState): boolean =>
  !!(
    f.search.trim() !== "" ||
    f.scope !== "all" ||
    f.activeTags.length > 0 ||
    (f.timeRange && (f.timeRange[0] !== null || f.timeRange[1] !== null)) ||
    (f.textLen && (f.textLen[0] !== null || f.textLen[1] !== null)) ||
    (f.fileSize && (f.fileSize[0] !== null || f.fileSize[1] !== null))
  );

function isLikelyCode(item: HistoryItem): boolean {
  if (item.contentType !== "text") return false;

  const language = item.metadata?.language?.[0]?.toLowerCase() ?? "";
  if (language) return true;

  const sourceApp = item.metadata?.sourceApp?.[0]?.toLowerCase() ?? "";
  if (/(code|visual studio|cursor|windsurf|terminal|powershell|cmd)/.test(sourceApp)) {
    return true;
  }

  const text = item.content;
  return (
    /<\/?[a-z][^>]*>/i.test(text) ||
    /\b(function|const|let|class|import|export|return|public|private|using|namespace)\b/.test(text) ||
    /[{};]{2,}|=>/.test(text)
  );
}

export function applyFilters(items: HistoryItem[], filter: FilterState): HistoryItem[] {
  const q = filter.search.trim().toLowerCase();
  const tagSet = new Set(filter.activeTags.map((t) => t.toLowerCase()));

  return items.filter((item) => {
    if (filter.scope === "pinned" && !item.pinned) return false;
    if (filter.scope === "text" && item.contentType !== "text") return false;
    if (filter.scope === "image" && item.contentType !== "image") return false;
    if (filter.scope === "file" && item.contentType !== "file") return false;

    if (filter.scope === "url") {
      const hasUrl = item.contentType === "text" && /https?:\/\/[^\s]+/i.test(item.content);
      if (!hasUrl) return false;
    }

    if (filter.scope === "code" && !isLikelyCode(item)) return false;

    if (filter.timeRange) {
      const dateStr = item.createdAt ?? item.lastUsedAt ?? "";
      if (dateStr) {
        const itemTime = new Date(dateStr).getTime();
        const [minT, maxT] = filter.timeRange;
        if (minT !== null && itemTime < minT) return false;
        if (maxT !== null && itemTime > maxT + 24 * 3600 * 1000 - 1) return false;
      }
    }

    if (filter.textLen && item.contentType === "text") {
      const [minL, maxL] = filter.textLen;
      const len = item.metadata?.length ? parseInt(item.metadata.length[0] || "0", 10) : item.content.length;
      if (minL !== null && len < minL) return false;
      if (maxL !== null && len > maxL) return false;
    }

    if (filter.fileSize && item.contentType === "file") {
      const [minS, maxS] = filter.fileSize;
      const sizeBytes = item.metadata?.totalSize ? parseInt(item.metadata.totalSize[0] || "0", 10) : 0;
      if (minS !== null && sizeBytes < minS) return false;
      if (maxS !== null && sizeBytes > maxS) return false;
    }

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

export function aggregateTags(items: HistoryItem[]): { tag: string; count: number }[] {
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
