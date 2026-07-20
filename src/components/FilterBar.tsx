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
  Clock,
  Type,
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
      className="text-xs font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-full bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500/20 text-center transition-all"
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
      className="text-xs font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-full bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500/20 text-center transition-all"
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
    const newArr = [
      advancedFilters.timeRange?.[0] ?? stats.minTime,
      advancedFilters.timeRange?.[1] ?? stats.maxTime
    ] as [number | null, number | null];
    newArr[idx] = ts ?? (idx === 0 ? stats.minTime : stats.maxTime);
    onAdvancedFilterChange({ timeRange: newArr });
  };

  const setText = (idx: 0 | 1, val: number | null) => {
    const newArr = [
      advancedFilters.textLen?.[0] ?? stats.minText,
      advancedFilters.textLen?.[1] ?? stats.maxText
    ] as [number | null, number | null];
    newArr[idx] = val ?? (idx === 0 ? stats.minText : stats.maxText);
    onAdvancedFilterChange({ textLen: newArr, fileSize: [null, null] });
    if (scope !== "text") onScopeChange("text");
  };

  const setFile = (idx: 0 | 1, val: number | null) => {
    const newArr = [
      advancedFilters.fileSize?.[0] ?? stats.minFile,
      advancedFilters.fileSize?.[1] ?? stats.maxFile
    ] as [number | null, number | null];
    newArr[idx] = val ?? (idx === 0 ? stats.minFile : stats.maxFile);
    onAdvancedFilterChange({ fileSize: newArr, textLen: [null, null] });
    if (scope !== "file") onScopeChange("file");
  };

  const isTimeActive = advancedFilters.timeRange?.some(v => v !== null);
  const isTextActive = advancedFilters.textLen?.some(v => v !== null);
  const isFileActive = advancedFilters.fileSize?.some(v => v !== null);

  return (
    <div className="px-4 py-2 bg-white border-b border-slate-100 space-y-3 sticky top-0 z-20">
      <div className="flex items-center gap-1.5 flex-wrap">
        {SCOPES.map(({ value, label, Icon }) => {
          const active = scope === value;
          return (
            <button
              key={value}
              onClick={() => onScopeChange(value)}
              className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition-all duration-200 ${
                active
                  ? "bg-blue-600 text-white shadow-md shadow-blue-100 scale-105"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
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

      <div className="flex flex-wrap gap-2.5 items-center pl-1 relative z-50">
        {/* 时间筛选 */}
        <div className="inline-flex items-center h-8 bg-slate-100/80 rounded-full border border-slate-200/60 overflow-hidden">
          <button
            onClick={() => {
              if (isTimeActive) onAdvancedFilterChange({ timeRange: [null, null] });
              else onAdvancedFilterChange({ timeRange: [stats.minTime, stats.maxTime] });
            }}
            className={`px-3 h-full text-[11px] font-semibold flex items-center gap-1.5 transition-all duration-200 outline-none ${
              isTimeActive 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200/50' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3 h-3" />
            时间
          </button>
          <div className="w-[1px] h-3.5 bg-slate-300/50" />
          <button
            onClick={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')}
            className={`px-2 h-full flex items-center transition-colors outline-none ${
              openDropdown === 'time' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'time' ? 'rotate-180' : ''}`} />
          </button>

          {openDropdown === 'time' && (
            <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-slate-200 p-4 min-w-[280px] animate-in fade-in zoom-in-95 duration-150 origin-top-left">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">起始</label>
                  <input
                    type="datetime-local" step="1"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={toDateTimeStr(advancedFilters.timeRange?.[0] ?? stats.minTime)}
                    onChange={(e) => setTime(0, e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">至</label>
                  <input
                    type="datetime-local" step="1"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={toDateTimeStr(advancedFilters.timeRange?.[1] ?? stats.maxTime)}
                    onChange={(e) => setTime(1, e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 长度筛选 */}
        <div className="inline-flex items-center h-8 bg-slate-100/80 rounded-full border border-slate-200/60 overflow-hidden">
          <button
            onClick={() => {
              if (isTextActive) {
                onAdvancedFilterChange({ textLen: [null, null] });
              } else {
                onAdvancedFilterChange({ 
                  textLen: [stats.minText, stats.maxText],
                  fileSize: [null, null] // 互斥逻辑
                });
                if (scope !== "text") onScopeChange("text");
              }
            }}
            className={`px-3 h-full text-[11px] font-semibold flex items-center gap-1.5 transition-all duration-200 outline-none ${
              isTextActive 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200/50' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Type className="w-3 h-3" />
            长度
          </button>
          <div className="w-[1px] h-3.5 bg-slate-300/50" />
          <button
            onClick={() => setOpenDropdown(openDropdown === 'text' ? null : 'text')}
            className={`px-2 h-full flex items-center transition-colors outline-none ${
              openDropdown === 'text' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'text' ? 'rotate-180' : ''}`} />
          </button>

          {openDropdown === 'text' && (
            <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-slate-200 p-4 min-w-[220px] animate-in fade-in zoom-in-95 duration-150 origin-top-left">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1.5 flex-1 text-center">
                  <label className="text-[10px] uppercase font-bold text-slate-400">最小</label>
                  <TextLenInput
                    value={advancedFilters.textLen?.[0] ?? stats.minText}
                    min={stats.minText} max={stats.maxText}
                    placeholder={String(stats.minText)}
                    onChange={(v) => setText(0, v)}
                  />
                </div>
                <div className="w-2 h-[1px] bg-slate-200 mt-6" />
                <div className="space-y-1.5 flex-1 text-center">
                  <label className="text-[10px] uppercase font-bold text-slate-400">最大</label>
                  <TextLenInput
                    value={advancedFilters.textLen?.[1] ?? stats.maxText}
                    min={stats.minText} max={stats.maxText}
                    placeholder={String(stats.maxText)}
                    onChange={(v) => setText(1, v)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 大小筛选 */}
        <div className="inline-flex items-center h-8 bg-slate-100/80 rounded-full border border-slate-200/60 overflow-hidden">
          <button
            onClick={() => {
              if (isFileActive) {
                onAdvancedFilterChange({ fileSize: [null, null] });
              } else {
                onAdvancedFilterChange({ 
                  fileSize: [stats.minFile, stats.maxFile],
                  textLen: [null, null] // 互斥逻辑
                });
                if (scope !== "file") onScopeChange("file");
              }
            }}
            className={`px-3 h-full text-[11px] font-semibold flex items-center gap-1.5 transition-all duration-200 outline-none ${
              isFileActive 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200/50' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3 h-3" />
            大小
          </button>
          <div className="w-[1px] h-3.5 bg-slate-300/50" />
          <button
            onClick={() => setOpenDropdown(openDropdown === 'file' ? null : 'file')}
            className={`px-2 h-full flex items-center transition-colors outline-none ${
              openDropdown === 'file' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'file' ? 'rotate-180' : ''}`} />
          </button>

          {openDropdown === 'file' && (
            <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-slate-200 p-4 min-w-[240px] animate-in fade-in zoom-in-95 duration-150 origin-top-left">
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1.5 text-center">
                  <label className="text-[10px] uppercase font-bold text-slate-400">最小 (MB)</label>
                  <FileMBInput
                    value={advancedFilters.fileSize?.[0] ?? stats.minFile}
                    min={stats.minFile} max={stats.maxFile}
                    placeholder={(stats.minFile / 1048576).toFixed(2)}
                    onChange={(v) => setFile(0, v)}
                  />
                </div>
                <div className="w-2 h-[1px] bg-slate-200 mt-6" />
                <div className="flex-1 space-y-1.5 text-center">
                  <label className="text-[10px] uppercase font-bold text-slate-400">最大 (MB)</label>
                  <FileMBInput
                    value={advancedFilters.fileSize?.[1] ?? stats.maxFile}
                    min={stats.minFile} max={stats.maxFile}
                    placeholder={(stats.maxFile / 1048576).toFixed(2)}
                    onChange={(v) => setFile(1, v)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {tagCounts.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {tagCounts.map(({ tag, count }) => {
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
        </div>
      )}
    </div>
  );
}
