import { useMemo, useState } from "react";
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Image as TauriImage } from "@tauri-apps/api/image";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

import { ClipboardCard } from "./components/ClipboardCard";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { FilterBar } from "./components/FilterBar";
import { SearchHeader } from "./components/SearchHeader";
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
const SHORTCUT = "CommandOrControl+Shift+E";

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

  const { history } = useHistory(setErrorMsg);
  useClipboardWatcher(POLL_INTERVAL_MS, setErrorMsg);
  useGlobalShortcut(SHORTCUT, setErrorMsg);

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
        await getCurrentWindow().hide();
      } catch (err) {
        setErrorMsg("Hide error: " + String(err));
      }

      setTimeout(async () => {
        try {
          await api.simulatePaste();
        } catch (err) {
          setErrorMsg("Paste simulation error: " + String(err));
        }
      }, 150);
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
      <SearchHeader value={search} onChange={setSearch} />
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
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            filtered={hasFilters && history.length > 0}
            onClear={hasFilters ? clearFilters : undefined}
          />
        ) : (
          filtered.map((item, index) => (
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
          ))
        )}
      </main>
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
