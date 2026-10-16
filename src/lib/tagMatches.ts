import type { HistoryItem } from "../types";

/**
 * Regex tag matches are stored in an item's metadata by the Rust pipeline: one
 * entry per rule that asked for extraction.
 *
 *   `tagMatch:<tag name>`      -> the distinct matches, truncated
 *   `tagMatchTotal:<tag name>` -> how many matched before truncation
 *
 * Keys are prefixed rather than nested because item metadata is a flat
 * `Record<string, string[]>`.
 */

export const TAG_MATCH_PREFIX = "tagMatch:";
export const TAG_MATCH_TOTAL_PREFIX = "tagMatchTotal:";

export interface TagMatchGroup {
  tag: string;
  values: string[];
  /** Match count before truncation; may exceed `values.length`. */
  total: number;
}

/** Every regex rule that matched this item, in metadata order. */
export function collectTagMatches(item: HistoryItem): TagMatchGroup[] {
  const metadata = item.metadata;
  if (!metadata) return [];

  const groups: TagMatchGroup[] = [];
  for (const [key, values] of Object.entries(metadata)) {
    if (!key.startsWith(TAG_MATCH_PREFIX)) continue;
    const tag = key.slice(TAG_MATCH_PREFIX.length);
    if (!tag || values.length === 0) continue;

    const parsed = Number.parseInt(metadata[`${TAG_MATCH_TOTAL_PREFIX}${tag}`]?.[0] ?? "", 10);
    groups.push({
      tag,
      values,
      total: Number.isFinite(parsed) ? parsed : values.length,
    });
  }

  return groups;
}
