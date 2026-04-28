import {
  FileText,
  Image as ImageIcon,
  Layers,
  Pin,
  Tag,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { aggregateTags, type Scope } from "../lib/filter";
import type { HistoryItem } from "../types";

interface Props {
  history: HistoryItem[];
  scope: Scope;
  onScopeChange: (s: Scope) => void;
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}

const SCOPES: { value: Scope; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "All", Icon: Layers },
  { value: "pinned", label: "Pinned", Icon: Pin },
  { value: "text", label: "Text", Icon: FileText },
  { value: "image", label: "Images", Icon: ImageIcon },
];

const MAX_TAG_CHIPS = 16;

export function FilterBar({
  history,
  scope,
  onScopeChange,
  activeTags,
  onToggleTag,
  hasActiveFilters,
  onClear,
  resultCount,
  totalCount,
}: Props) {
  const tagCounts = aggregateTags(history);
  const hiddenTagCount = Math.max(0, tagCounts.length - MAX_TAG_CHIPS);
  const visibleTags = tagCounts.slice(0, MAX_TAG_CHIPS);

  return (
    <div className="px-4 py-2 bg-white border-b border-slate-100 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {SCOPES.map(({ value, label, Icon }) => {
          const active = scope === value;
          return (
            <button
              key={value}
              onClick={() => onScopeChange(value)}
              className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1 transition-colors ${
                active
                  ? "bg-blue-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          {hasActiveFilters && (
            <>
              <span>
                {resultCount} / {totalCount}
              </span>
              <button
                onClick={onClear}
                className="flex items-center gap-1 hover:text-red-500"
                title="Clear all filters"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            </>
          )}
        </div>
      </div>

      {visibleTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {visibleTags.map(({ tag, count }) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onToggleTag(tag)}
                className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-colors ${
                  active
                    ? "bg-blue-500 text-white"
                    : "bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"
                }`}
                title={active ? `Remove filter: ${tag}` : `Filter by tag: ${tag}`}
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
                <span
                  className={`text-[10px] ${
                    active ? "text-blue-100" : "text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {hiddenTagCount > 0 && (
            <span className="text-xs text-slate-400 px-1">
              +{hiddenTagCount} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
