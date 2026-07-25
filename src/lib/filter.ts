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

interface ParsedSearchQuery {
  includeTerms: string[];
  excludeTerms: string[];
  includePhrases: string[];
  excludePhrases: string[];
  includeTags: string[];
  excludeTags: string[];
  includeApps: string[];
  excludeApps: string[];
  includeTypes: string[];
  excludeTypes: string[];
  pinned: boolean | null;
  privateState: boolean | null;
  after: number | null;
  before: number | null;
  textLength: [number | null, number | null];
  fileSize: [number | null, number | null];
  chips: string[];
}

export const SEARCH_PRESETS = [
  { label: "Pinned", query: "is:pinned" },
  { label: "Chrome", query: "app:chrome" },
  { label: "Text > 120", query: "type:text len:>120" },
  { label: "Recent 7d", query: "after:7d" },
  { label: "Images", query: "type:image" },
  { label: "Files < 5mb", query: "type:file size:<5mb" },
] as const;

export const SEARCH_HINTS = [
  `tag:work app:chrome`,
  `"exact phrase" -draft`,
  `type:text len:>120`,
  `is:pinned after:2026-07-01`,
  `size:<5mb is:private`,
] as const;

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

function hasUrl(item: HistoryItem) {
  return item.contentType === "text" && /https?:\/\/[^\s]+/i.test(item.content);
}

function tokenizeSearch(query: string) {
  return query.match(/"[^"]*"|\S+/g) ?? [];
}

function parseNumberRange(token: string): [number | null, number | null] | null {
  const match = token.match(/^(<=|>=|=|<|>)(.+)$/);
  if (!match) return null;
  const [, operator, raw] = match;
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) return null;

  if (operator === ">") return [value + 1, null];
  if (operator === ">=") return [value, null];
  if (operator === "<") return [null, Math.max(0, value - 1)];
  if (operator === "<=") return [null, value];
  return [value, value];
}

function parseBytes(raw: string): number | null {
  const match = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2] ?? "b";
  const factor =
    unit === "tb" ? 1024 ** 4 :
    unit === "gb" ? 1024 ** 3 :
    unit === "mb" ? 1024 ** 2 :
    unit === "kb" ? 1024 :
    1;
  return Math.round(value * factor);
}

function parseSizeRange(token: string): [number | null, number | null] | null {
  const match = token.match(/^(<=|>=|=|<|>)(.+)$/);
  if (!match) return null;
  const [, operator, raw] = match;
  const value = parseBytes(raw);
  if (value === null) return null;

  if (operator === ">") return [value + 1, null];
  if (operator === ">=") return [value, null];
  if (operator === "<") return [null, Math.max(0, value - 1)];
  if (operator === "<=") return [null, value];
  return [value, value];
}

function mergeRange(
  current: [number | null, number | null],
  next: [number | null, number | null],
): [number | null, number | null] {
  const min = current[0] === null ? next[0] : next[0] === null ? current[0] : Math.max(current[0], next[0]);
  const max = current[1] === null ? next[1] : next[1] === null ? current[1] : Math.min(current[1], next[1]);
  return [min, max];
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function endOfDay(value: Date) {
  return startOfDay(value) + 24 * 3600 * 1000 - 1;
}

function hasExplicitTime(raw: string) {
  return /(?:t|\s)\d{1,2}:\d{2}/i.test(raw.trim());
}

function parseDateValue(raw: string): { after?: number; before?: number } | null {
  const value = raw.trim().toLowerCase();
  const now = new Date();

  if (value === "today") {
    return { after: startOfDay(now), before: endOfDay(now) };
  }

  if (value === "yesterday") {
    const date = new Date(now);
    date.setDate(now.getDate() - 1);
    return { after: startOfDay(date), before: endOfDay(date) };
  }

  const relative = value.match(/^(\d+)d$/);
  if (relative) {
    const days = Number(relative[1]);
    if (Number.isFinite(days)) {
      const date = new Date(now);
      date.setDate(now.getDate() - days);
      return { after: startOfDay(date) };
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (hasExplicitTime(raw)) return { after: parsed.getTime(), before: parsed.getTime() };
  return { after: startOfDay(parsed), before: endOfDay(parsed) };
}

function parseDateRangeValue(raw: string): { after?: number; before?: number } | null {
  const value = raw.trim();
  if (!value) return null;

  const rangeSeparator = value.includes("..") ? ".." : value.includes("~") ? "~" : null;
  if (!rangeSeparator) return parseDateValue(value);

  const [startRaw, endRaw] = value.split(rangeSeparator, 2).map((part) => part.trim());
  if (!startRaw && !endRaw) return null;

  const start = startRaw ? parseDateValue(startRaw) : null;
  const end = endRaw ? parseDateValue(endRaw) : null;
  if (startRaw && !start) return null;
  if (endRaw && !end) return null;

  return {
    after: start?.after,
    before: end?.before,
  };
}

function pushChip(target: string[], enabled: boolean, label: string) {
  if (enabled) target.push(label);
}

function parseSearchQuery(query: string): ParsedSearchQuery {
  const parsed: ParsedSearchQuery = {
    includeTerms: [],
    excludeTerms: [],
    includePhrases: [],
    excludePhrases: [],
    includeTags: [],
    excludeTags: [],
    includeApps: [],
    excludeApps: [],
    includeTypes: [],
    excludeTypes: [],
    pinned: null,
    privateState: null,
    after: null,
    before: null,
    textLength: [null, null],
    fileSize: [null, null],
    chips: [],
  };

  for (const token of tokenizeSearch(query)) {
    let negative = false;
    let raw = token.trim();
    if (!raw) continue;

    while (raw.startsWith("-")) {
      negative = !negative;
      raw = raw.slice(1);
    }
    if (!raw) continue;

    const isQuoted = raw.startsWith("\"") && raw.endsWith("\"") && raw.length >= 2;
    const clean = isQuoted ? raw.slice(1, -1).trim() : raw.trim();
    if (!clean) continue;

    if (clean.startsWith("#")) {
      (negative ? parsed.excludeTags : parsed.includeTags).push(clean.slice(1).toLowerCase());
      pushChip(parsed.chips, !negative, `tag:${clean.slice(1)}`);
      pushChip(parsed.chips, negative, `not tag:${clean.slice(1)}`);
      continue;
    }

    const separator = clean.indexOf(":");
    if (separator > 0) {
      const field = clean.slice(0, separator).toLowerCase();
      const value = clean.slice(separator + 1).trim();
      if (value) {
        if (field === "tag") {
          (negative ? parsed.excludeTags : parsed.includeTags).push(value.toLowerCase());
          pushChip(parsed.chips, !negative, `tag:${value}`);
          pushChip(parsed.chips, negative, `not tag:${value}`);
          continue;
        }

        if (field === "app") {
          (negative ? parsed.excludeApps : parsed.includeApps).push(value.toLowerCase());
          pushChip(parsed.chips, !negative, `app:${value}`);
          pushChip(parsed.chips, negative, `not app:${value}`);
          continue;
        }

        if (field === "type") {
          (negative ? parsed.excludeTypes : parsed.includeTypes).push(value.toLowerCase());
          pushChip(parsed.chips, !negative, `type:${value}`);
          pushChip(parsed.chips, negative, `not type:${value}`);
          continue;
        }

        if (field === "is") {
          const normalized = value.toLowerCase();
          if (normalized === "pinned") parsed.pinned = !negative;
          if (normalized === "private") parsed.privateState = !negative;
          if (normalized === "public") parsed.privateState = negative;
          pushChip(parsed.chips, normalized === "pinned", `${negative ? "not " : ""}pinned`);
          pushChip(parsed.chips, normalized === "private", `${negative ? "not " : ""}private`);
          pushChip(parsed.chips, normalized === "public", negative ? "private" : "public");
          continue;
        }

        if (field === "after" || field === "since") {
          const date = parseDateValue(value);
          if (date?.after !== undefined) {
            parsed.after = parsed.after === null ? date.after : Math.max(parsed.after, date.after);
            parsed.chips.push(`after:${value}`);
            continue;
          }
        }

        if (field === "before" || field === "until") {
          const date = parseDateValue(value);
          if (date?.before !== undefined) {
            parsed.before = parsed.before === null ? date.before : Math.min(parsed.before, date.before);
            parsed.chips.push(`before:${value}`);
            continue;
          }
        }

        if (field === "date" || field === "time" || field === "created") {
          const dateRange = parseDateRangeValue(value);
          if (dateRange) {
            if (dateRange.after !== undefined) {
              parsed.after = parsed.after === null ? dateRange.after : Math.max(parsed.after, dateRange.after);
            }
            if (dateRange.before !== undefined) {
              parsed.before = parsed.before === null ? dateRange.before : Math.min(parsed.before, dateRange.before);
            }
            parsed.chips.push(`${field}:${value}`);
            continue;
          }
        }

        if (field === "len" || field === "chars") {
          const range = parseNumberRange(value);
          if (range) {
            parsed.textLength = mergeRange(parsed.textLength, range);
            parsed.chips.push(`len:${value}`);
            continue;
          }
        }

        if (field === "size") {
          const range = parseSizeRange(value);
          if (range) {
            parsed.fileSize = mergeRange(parsed.fileSize, range);
            parsed.chips.push(`size:${value}`);
            continue;
          }
        }
      }
    }

    if (isQuoted) {
      (negative ? parsed.excludePhrases : parsed.includePhrases).push(clean.toLowerCase());
      parsed.chips.push(`${negative ? "not " : ""}"${clean}"`);
      continue;
    }

    (negative ? parsed.excludeTerms : parsed.includeTerms).push(clean.toLowerCase());
    parsed.chips.push(`${negative ? "not " : ""}${clean}`);
  }

  return parsed;
}

export function describeSearchQuery(search: string): string[] {
  return parseSearchQuery(search).chips;
}

function matchText(haystacks: string[], needle: string) {
  return haystacks.some((value) => value.includes(needle));
}

function matchType(item: HistoryItem, type: string) {
  if (type === "text" || type === "image" || type === "file") {
    return item.contentType === type;
  }
  if (type === "code") return isLikelyCode(item);
  if (type === "url" || type === "link") return hasUrl(item);
  return item.contentType === type;
}

export function applyFilters(items: HistoryItem[], filter: FilterState): HistoryItem[] {
  const parsed = parseSearchQuery(filter.search);
  const tagSet = new Set(filter.activeTags.map((t) => t.toLowerCase()));

  const matchesSelectedTag = (item: HistoryItem, tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return true;
    if (normalized === "text") return item.contentType === "text";
    if (normalized === "image") return item.contentType === "image";
    if (normalized === "file") return item.contentType === "file";
    if (normalized === "pinned") return item.pinned;
    if (normalized === "private") return item.isPrivate;
    return item.tags.some((value) => value.toLowerCase() === normalized);
  };

  return items.filter((item) => {
    if (filter.scope === "pinned" && !item.pinned) return false;
    if (filter.scope === "text" && item.contentType !== "text") return false;
    if (filter.scope === "image" && item.contentType !== "image") return false;
    if (filter.scope === "file" && item.contentType !== "file") return false;
    if (filter.scope === "url" && !hasUrl(item)) return false;
    if (filter.scope === "code" && !isLikelyCode(item)) return false;

    const dateStr = item.createdAt ?? item.lastUsedAt ?? "";
    const itemTime = dateStr ? new Date(dateStr).getTime() : null;
    const textLength = item.metadata?.length ? parseInt(item.metadata.length[0] || "0", 10) : item.content.length;
    const itemSize = item.metadata?.totalSize?.[0] ?? item.metadata?.size?.[0] ?? "0";
    const fileSize = parseInt(itemSize, 10) || 0;

    if (filter.timeRange && itemTime !== null) {
      const [minT, maxT] = filter.timeRange;
      if (minT !== null && itemTime < minT) return false;
      if (maxT !== null && itemTime > maxT + 24 * 3600 * 1000 - 1) return false;
    }

    if (filter.textLen && item.contentType === "text") {
      const [minL, maxL] = filter.textLen;
      if (minL !== null && textLength < minL) return false;
      if (maxL !== null && textLength > maxL) return false;
    }

    if (filter.fileSize && item.contentType === "file") {
      const [minS, maxS] = filter.fileSize;
      if (minS !== null && fileSize < minS) return false;
      if (maxS !== null && fileSize > maxS) return false;
    }

    if (tagSet.size > 0) {
      for (const t of tagSet) {
        if (!matchesSelectedTag(item, t)) return false;
      }
    }

    const content = item.content.toLowerCase();
    const app = item.metadata?.sourceApp?.[0]?.toLowerCase() ?? "";
    const metadataValues = Object.values(item.metadata).flat().map((value) => value.toLowerCase());
    const tags = item.tags.map((tag) => tag.toLowerCase());
    const genericHaystacks = [content, app, ...metadataValues, ...tags];

    if (parsed.pinned !== null && item.pinned !== parsed.pinned) return false;
    if (parsed.privateState !== null && item.isPrivate !== parsed.privateState) return false;
    if (parsed.after !== null && (itemTime === null || itemTime < parsed.after)) return false;
    if (parsed.before !== null && (itemTime === null || itemTime > parsed.before)) return false;

    const [queryMinLength, queryMaxLength] = parsed.textLength;
    if (queryMinLength !== null && textLength < queryMinLength) return false;
    if (queryMaxLength !== null && textLength > queryMaxLength) return false;

    const [queryMinSize, queryMaxSize] = parsed.fileSize;
    if (queryMinSize !== null && fileSize < queryMinSize) return false;
    if (queryMaxSize !== null && fileSize > queryMaxSize) return false;

    for (const term of parsed.includeTerms) {
      if (!matchText(genericHaystacks, term)) return false;
    }
    for (const term of parsed.excludeTerms) {
      if (matchText(genericHaystacks, term)) return false;
    }
    for (const phrase of parsed.includePhrases) {
      if (!matchText(genericHaystacks, phrase)) return false;
    }
    for (const phrase of parsed.excludePhrases) {
      if (matchText(genericHaystacks, phrase)) return false;
    }
    for (const tag of parsed.includeTags) {
      if (!tags.includes(tag)) return false;
    }
    for (const tag of parsed.excludeTags) {
      if (tags.includes(tag)) return false;
    }
    for (const appTerm of parsed.includeApps) {
      if (!app.includes(appTerm)) return false;
    }
    for (const appTerm of parsed.excludeApps) {
      if (app.includes(appTerm)) return false;
    }
    for (const type of parsed.includeTypes) {
      if (!matchType(item, type)) return false;
    }
    for (const type of parsed.excludeTypes) {
      if (matchType(item, type)) return false;
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
