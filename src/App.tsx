import { useMemo, useState, useEffect } from "react";
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Image as TauriImage } from "@tauri-apps/api/image";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

import { ClipboardCard } from "./components/ClipboardCard";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { FilterBar } from "./components/FilterBar";
import { SearchHeader } from "./components/SearchHeader";
import { SettingsModal } from "./components/SettingsModal";
import { useClipboardWatcher, setInjectedOverrideSig } from "./hooks/useClipboardWatcher";
import { useGlobalShortcut } from "./hooks/useGlobalShortcut";
import { useHistory } from "./hooks/useHistory";
import { api } from "./lib/api";
import {
  applyFilters,
  emptyFilter,
  isFilterActive,
  type Scope,
  type FilterState,
} from "./lib/filter";
import type { HistoryItem } from "./types";

const POLL_INTERVAL_MS = 500;
const DEFAULT_SHORTCUT = "CommandOrControl+Shift+E";

function App() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [advancedFilters, setAdvancedFilters] = useState<Partial<FilterState>>({
    timeRange: [null, null],
    textLen: [null, null],
    fileSize: [null, null]
  });
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [taggingId, setTaggingId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [autoPaste, setAutoPaste] = useState(true);
  const [keepWindowOpen, setKeepWindowOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, scope, activeTags, advancedFilters]);

  useMemo(() => {
    api.getConfig().then(cfg => {
        if (cfg) {
            if (cfg.shortcut) setShortcut(cfg.shortcut);
            if (typeof (cfg as any).autoPaste === 'boolean') setAutoPaste((cfg as any).autoPaste);
            if (typeof (cfg as any).keepWindowOpen === 'boolean') setKeepWindowOpen((cfg as any).keepWindowOpen);
            if (typeof (cfg as any).pageSize === 'number') setPageSize((cfg as any).pageSize);
        }
    }).catch(e => console.error(e));
  }, []);

  const { history } = useHistory(setErrorMsg);
  
  useClipboardWatcher(POLL_INTERVAL_MS, setErrorMsg);
  useGlobalShortcut(shortcut, setErrorMsg);

  const filterState = { search, scope, activeTags, ...advancedFilters };
  const filtered = useMemo(
    () => applyFilters(history, filterState as FilterState),
    [history, search, scope, activeTags, advancedFilters],
  );
  const hasFilters = isFilterActive(filterState);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    const f = emptyFilter();
    setSearch(f.search);
    setScope(f.scope);
    setActiveTags(f.activeTags);
    setAdvancedFilters({
      timeRange: [null, null],
      textLen: [null, null],
      fileSize: [null, null]
    });
  };

  const handleCopy = async (item: HistoryItem | { id: number; content: string; contentType: "text" }) => {
    try {
      if (item.contentType === "text") {
        await writeText(item.content);
        setInjectedOverrideSig(item.content);
      } else if ("contentType" in item && item.contentType === "image") {
        const size = await writeImageDataUrl(item.content);
        if (size) {
          setInjectedOverrideSig(`img_${size.width}x${size.height}`);
        }
      }

      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);

      try {
        if (item.id > 0) {
          await api.markUsed(item.id);
        }
      } catch (err) {
        console.error("mark_used failed", err);
      }

      try {
        if (!keepWindowOpen) {
          await getCurrentWindow().hide();
        }
      } catch (err) {
        setErrorMsg("Hide error: " + String(err));
      }

      if (autoPaste) {
        setTimeout(async () => {
          try {
            await api.simulatePaste();
          } catch (err) {
            setErrorMsg("Paste simulation error: " + String(err));
          }
        }, 150);
      }
    } catch (err: any) {
      setErrorMsg("Copy error: " + (err?.message ?? String(err)));
    }
  };

  const handleTogglePin = async (id: number) => {
    try {
      await api.togglePin(id);
    } catch (err) {
      setErrorMsg("Pin error: " + String(err));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteItem(id);
    } catch (err) {
      setErrorMsg("Delete error: " + String(err));
    }
  };

  const handleAddTag = async (id: number, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const item = history.find((i) => i.id === id);
    if (!item || item.tags.includes(trimmed)) return;
    try {
      await api.setTags(id, [...item.tags, trimmed]);
    } catch (err) {
      setErrorMsg("Add tag error: " + String(err));
    }
  };

  const handleRemoveTag = async (id: number, tag: string) => {
    const item = history.find((i) => i.id === id);
    if (!item) return;
    try {
      await api.setTags(id, item.tags.filter((t) => t !== tag));
    } catch (err) {
      setErrorMsg("Remove tag error: " + String(err));
    }
  };

  const startTag = (id: number) => {
    setTaggingId(id);
    setTagInput("");
  };
  const stopTag = () => {
    setTaggingId(null);
    setTagInput("");
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col text-slate-800 font-sans">
      <SearchHeader value={search} onChange={setSearch} onSettingsClick={() => setShowSettings(true)} />
      <FilterBar
        history={history}
        scope={scope}
        onScopeChange={setScope}
        activeTags={activeTags}
        onToggleTag={toggleTag}
        hasActiveFilters={hasFilters}
        onClear={clearFilters}
        resultCount={filtered.length}
        totalCount={history.length}
        advancedFilters={advancedFilters}
        onAdvancedFilterChange={(u) => setAdvancedFilters(prev => ({ ...prev, ...u }))}
      />
      <ErrorBanner message={errorMsg} />
      
      {/* 固定的分页栏区 */}
      {filtered.length > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        
        const getPageNumbers = () => {
          if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
          if (page < 3) return [0, 1, 2, 3, 4, '...', totalPages - 1];
          if (page >= totalPages - 3) return [0, '...', totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1];
          return [0, '...', page - 1, page, page + 1, '...', totalPages - 1];
        };

        const pageNumbers = getPageNumbers();

        return (
          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 sticky top-0 z-10 shadow-sm">
            <button 
              onClick={() => setPage(page - 1)} 
              disabled={page === 0}
              className="px-3 py-1 text-sm font-medium rounded transition-colors text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              上一页
            </button>

            <div className="flex items-center justify-center gap-1 flex-1 px-4 overflow-x-auto">
              {pageNumbers.map((p, i) => {
                if (p === '...') {
                  return <span key={`ellipsis-${i}`} className="px-1 text-slate-400 text-sm">...</span>;
                }
                const pageNum = p as number;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[28px] h-7 px-1 flex items-center justify-center rounded text-sm transition-colors cursor-pointer ${
                      page === pageNum 
                        ? "bg-blue-500 text-white font-medium" 
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
            </div>

            <button 
              onClick={() => setPage(page + 1)} 
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-sm font-medium rounded transition-colors text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              下一页
            </button>
          </div>
        );
      })()}

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            filtered={hasFilters && history.length > 0}
            onClear={hasFilters ? clearFilters : undefined}
          />
        ) : (
          <>
            {filtered.slice(page * pageSize, (page + 1) * pageSize).map((item, index) => (
              <ClipboardCard
                key={item.id}
                item={item}
                isCopied={copiedId === item.id}
                isTagging={taggingId === item.id}
                tagInput={tagInput}
                showExtracts={index < 5}
                onCopy={handleCopy}
                onTogglePin={handleTogglePin}
                onDelete={handleDelete}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onStartTag={startTag}
                onStopTag={stopTag}
                onTagInputChange={setTagInput}
                onIngestExtract={async (content) => {
                  try {
                    await api.ingest("text", content);
                  } catch (err) {
                    setErrorMsg("Ingest extract error: " + String(err));
                  }
                }}
              />
            ))}
            
          </>
        )}
      </main>
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

async function writeImageDataUrl(dataUrl: string): Promise<{ width: number; height: number } | null> {
  const htmlImg = new window.Image();
  htmlImg.src = dataUrl;
  await new Promise((resolve, reject) => {
    htmlImg.onload = resolve;
    htmlImg.onerror = reject;
  });
  const canvas = document.createElement("canvas");
  canvas.width = htmlImg.width;
  canvas.height = htmlImg.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(htmlImg, 0, 0);
  const imageData = ctx.getImageData(0, 0, htmlImg.width, htmlImg.height);
  const tauriImg = await TauriImage.new(
    imageData.data.buffer,
    htmlImg.width,
    htmlImg.height,
  );
  await writeImage(tauriImg);
  return { width: htmlImg.width, height: htmlImg.height };
}

export default App;
