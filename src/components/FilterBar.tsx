import {
  FileText,
  Image as ImageIcon,
  File,
  Link,
  Mail,
  Layers,
  Pin,
  Tag,
  X,
  ChevronDown,
} from "lucide-react";
import { useState, useMemo, useEffect, type ComponentType } from "react";
import { aggregateTags, type Scope, type FilterState } from "../lib/filter";
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
  advancedFilters: Partial<FilterState>;
  onAdvancedFilterChange: (updates: Partial<FilterState>) => void;
}

const SCOPES: { value: Scope; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "全部", Icon: Layers },
  { value: "pinned", label: "固定", Icon: Pin },
  { value: "text", label: "文本", Icon: FileText },
  { value: "image", label: "图片", Icon: ImageIcon },
  { value: "file", label: "文件", Icon: File },
  { value: "url", label: "链接", Icon: Link },
  { value: "email", label: "邮箱", Icon: Mail },
];

const MAX_TAG_CHIPS = 16;

const toDateTimeStr = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

function clamp(val: number, min: number, max: number) {
  if (val > max) return max;
  if (val < min) return min;
  return val;
}

function FileMBInput({ value, min, max, onChange, placeholder }: { value: number | null, min: number, max: number, onChange: (v: number | null) => void, placeholder: string }) {
  const [str, setStr] = useState(value !== null ? (value / 1048576).toString() : "");

  useEffect(() => {
    if (value === null && str !== "") setStr("");
    else if (value !== null) {
      const mb = parseFloat(str);
      if (isNaN(mb) || Math.floor(mb * 1048576) !== value) setStr((value / 1048576).toString());
    }
  }, [value]);

  return (
    <input
      type="number"
      placeholder={placeholder}
      min={0} step="0.01"
      className="text-xs border border-slate-200 rounded px-1.5 py-1 w-24 outline-none focus:ring-1 focus:ring-blue-400 text-center"
      value={str}
      onChange={(e) => {
        setStr(e.target.value);
        if (e.target.value === "") return onChange(null);
        const mb = parseFloat(e.target.value);
        if (!isNaN(mb)) {
          const bytes = Math.floor(mb * 1048576);
          if (bytes > max || bytes < min) {
             const clamped = clamp(bytes, min, max);
             onChange(clamped);
             setStr((clamped / 1048576).toString());
          } else onChange(bytes);
        }
      }}
      onBlur={(e) => {
        const mb = parseFloat(e.target.value);
        if (!isNaN(mb)) setStr((clamp(Math.floor(mb * 1048576), min, max) / 1048576).toString());
      }}
    />
  );
}

function TextLenInput({ value, min, max, onChange, placeholder }: { value: number | null, min: number, max: number, onChange: (v: number | null) => void, placeholder: string }) {
  const [str, setStr] = useState(value !== null ? value.toString() : "");

  useEffect(() => {
    if (value === null && str !== "") setStr("");
    else if (value !== null && parseInt(str, 10) !== value) setStr(value.toString());
  }, [value]);

  return (
    <input
      type="number"
      placeholder={placeholder}
      min={min} max={max}
      className="text-xs border border-slate-200 rounded px-1.5 py-1 w-20 outline-none focus:ring-1 focus:ring-blue-400 text-center"
      value={str}
      onChange={(e) => {
        setStr(e.target.value);
        if (e.target.value === "") return onChange(null);
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          if (val > max || val < min) {
             const clamped = clamp(val, min, max);
             onChange(clamped);
             setStr(clamped.toString());
          } else onChange(val);
        }
      }}
      onBlur={(e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) setStr(clamp(val, min, max).toString());
      }}
    />
  );
}

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
  advancedFilters,
  onAdvancedFilterChange,
}: Props) {
  const tagCounts = aggregateTags(history);
  const hiddenTagCount = Math.max(0, tagCounts.length - MAX_TAG_CHIPS);
  const visibleTags = tagCounts.slice(0, MAX_TAG_CHIPS);
  const [openDropdown, setOpenDropdown] = useState<'time' | 'text' | 'file' | null>(null);

  const stats = useMemo(() => {
    let minTime = Infinity, maxTime = -Infinity;
    let minText = Infinity, maxText = -Infinity;
    let minFile = Infinity, maxFile = -Infinity;

    history.forEach(item => {
      const timeMs = new Date(item.createdAt ?? item.lastUsedAt ?? Date.now()).getTime();
      if (timeMs < minTime) minTime = timeMs;
      if (timeMs > maxTime) maxTime = timeMs;

      if (item.contentType === "text") {
        const len = item.metadata?.length ? parseInt(item.metadata.length[0] || "0", 10) : (item.content?.length || 0);
        if (len < minText) minText = len;
        if (len > maxText) maxText = len;
      } else if (item.contentType === "file") {
        const sizeBytes = item.metadata?.totalSize ? parseInt(item.metadata.totalSize[0] || "0", 10) : 0;
        if (sizeBytes < minFile) minFile = sizeBytes;
        if (sizeBytes > maxFile) maxFile = sizeBytes;
      }
    });

    return {
      minTime: minTime === Infinity ? Date.now() : minTime,
      maxTime: maxTime === -Infinity ? Date.now() : maxTime,
      minText: minText === Infinity ? 0 : minText,
      maxText: maxText === -Infinity ? 0 : maxText,
      minFile: minFile === Infinity ? 0 : minFile,
      maxFile: maxFile === -Infinity ? 0 : maxFile,
    };
  }, [history]);

  const setTime = (idx: 0 | 1, val: string) => {
    let ts = val ? new Date(val).getTime() : null;
    if (ts !== null) ts = clamp(ts, stats.minTime, stats.maxTime);
    const newArr = [...(advancedFilters.timeRange || [null, null])] as [number | null, number | null];
    newArr[idx] = ts;
    onAdvancedFilterChange({ timeRange: newArr });
  };

  const setText = (idx: 0 | 1, val: number | null) => {
    const newArr = [...(advancedFilters.textLen || [null, null])] as [number | null, number | null];
    newArr[idx] = val;
    onAdvancedFilterChange({ textLen: newArr });
    if (val !== null && scope !== "text") onScopeChange("text");
  };

  const setFile = (idx: 0 | 1, val: number | null) => {
    const newArr = [...(advancedFilters.fileSize || [null, null])] as [number | null, number | null];
    newArr[idx] = val;
    onAdvancedFilterChange({ fileSize: newArr });
    if (val !== null && scope !== "file") onScopeChange("file");
  };

  const isTimeActive = advancedFilters.timeRange?.some(v => v !== null);
  const isTextActive = advancedFilters.textLen?.some(v => v !== null);
  const isFileActive = advancedFilters.fileSize?.some(v => v !== null);

  return (
    <div className="px-4 py-2 bg-white border-b border-slate-100 space-y-3">
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

        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-xs text-slate-400 border-l border-slate-200 pl-2">
              <span>
                {resultCount} / {totalCount}
              </span>
              <button
                onClick={onClear}
                className="flex items-center gap-1 hover:text-red-500 transition-colors"
                title="Clear all filters"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {openDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
      )}

      <div className="flex flex-wrap gap-3 items-center pl-1 relative z-50">
        <div className={`relative flex items-center rounded-full border transition-colors ${isTimeActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
          <button
            onClick={() => {
              if (isTimeActive) onAdvancedFilterChange({ timeRange: [null, null] });
              else onAdvancedFilterChange({ timeRange: [stats.minTime, stats.maxTime] });
            }}
            className={`px-3 py-1 flex items-center gap-1.5 rounded-l-full text-xs transition-colors ${isTimeActive ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}
          >
            <span>时间筛选</span>
          </button>
          <div className={`w-px h-4 ${isTimeActive ? 'bg-indigo-200' : 'bg-slate-200'}`}></div>
          <button
            onClick={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')}
            className={`px-2 py-1 flex items-center justify-center rounded-r-full transition-colors ${isTimeActive ? 'text-indigo-600 hover:bg-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${openDropdown === 'time' ? 'rotate-180' : ''}`} />
          </button>
          {openDropdown === 'time' && (
            <div className="absolute top-full mt-1.5 left-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex items-center gap-2 z-50">
              <input
                type="datetime-local"
                step="1"
                className="text-xs border border-slate-200 rounded px-1.5 py-1 min-w-[150px] outline-none focus:ring-1 focus:ring-blue-400"
                min={toDateTimeStr(stats.minTime)} max={toDateTimeStr(stats.maxTime)}
                value={advancedFilters.timeRange?.[0] ? toDateTimeStr(advancedFilters.timeRange[0]) : ""}
                onChange={(e) => setTime(0, e.target.value)}
              />
              <span className="text-xs text-slate-400">-</span>
              <input
                type="datetime-local"
                step="1"
                className="text-xs border border-slate-200 rounded px-1.5 py-1 min-w-[150px] outline-none focus:ring-1 focus:ring-blue-400"
                min={toDateTimeStr(stats.minTime)} max={toDateTimeStr(stats.maxTime)}
                value={advancedFilters.timeRange?.[1] ? toDateTimeStr(advancedFilters.timeRange[1]) : ""}
                onChange={(e) => setTime(1, e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={`relative flex items-center rounded-full border transition-colors ${isTextActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
          <button
            onClick={() => {
              if (isTextActive) onAdvancedFilterChange({ textLen: [null, null] });
              else {
                onAdvancedFilterChange({ textLen: [stats.minText, stats.maxText] });
                if (scope !== "text") onScopeChange("text");
              }
            }}
            className={`px-3 py-1 flex items-center gap-1.5 rounded-l-full text-xs transition-colors ${isTextActive ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}
          >
            <span>文本字数</span>
          </button>
          <div className={`w-px h-4 ${isTextActive ? 'bg-indigo-200' : 'bg-slate-200'}`}></div>
          <button
            onClick={() => setOpenDropdown(openDropdown === 'text' ? null : 'text')}
            className={`px-2 py-1 flex items-center justify-center rounded-r-full transition-colors ${isTextActive ? 'text-indigo-600 hover:bg-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${openDropdown === 'text' ? 'rotate-180' : ''}`} />
          </button>
          {openDropdown === 'text' && (
            <div className="absolute top-full mt-1.5 left-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex items-center gap-2 z-50">
              <TextLenInput
                value={advancedFilters.textLen?.[0] ?? null}
                min={stats.minText} max={stats.maxText}
                placeholder={String(stats.minText)}
                onChange={(v) => setText(0, v)}
              />
              <span className="text-xs text-slate-400">-</span>
              <TextLenInput
                value={advancedFilters.textLen?.[1] ?? null}
                min={stats.minText} max={stats.maxText}
                placeholder={String(stats.maxText)}
                onChange={(v) => setText(1, v)}
              />
            </div>
          )}
        </div>

        <div className={`relative flex items-center rounded-full border transition-colors ${isFileActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
          <button
            onClick={() => {
              if (isFileActive) onAdvancedFilterChange({ fileSize: [null, null] });
              else {
                onAdvancedFilterChange({ fileSize: [stats.minFile, stats.maxFile] });
                if (scope !== "file") onScopeChange("file");
              }
            }}
            className={`px-3 py-1 flex items-center gap-1.5 rounded-l-full text-xs transition-colors ${isFileActive ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}
          >
            <span>文件大小 (MB)</span>
          </button>
          <div className={`w-px h-4 ${isFileActive ? 'bg-indigo-200' : 'bg-slate-200'}`}></div>
          <button
            onClick={() => setOpenDropdown(openDropdown === 'file' ? null : 'file')}
            className={`px-2 py-1 flex items-center justify-center rounded-r-full transition-colors ${isFileActive ? 'text-indigo-600 hover:bg-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${openDropdown === 'file' ? 'rotate-180' : ''}`} />
          </button>
          {openDropdown === 'file' && (
            <div className="absolute top-full mt-1.5 left-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex items-center gap-2 z-50">
              <FileMBInput
                value={advancedFilters.fileSize?.[0] ?? null}
                min={stats.minFile} max={stats.maxFile}
                placeholder={(stats.minFile / 1048576).toFixed(2)}
                onChange={(v) => setFile(0, v)}
              />
              <span className="text-xs text-slate-400">-</span>
              <FileMBInput
                value={advancedFilters.fileSize?.[1] ?? null}
                min={stats.minFile} max={stats.maxFile}
                placeholder={(stats.maxFile / 1048576).toFixed(2)}
                onChange={(v) => setFile(1, v)}
              />
            </div>
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
