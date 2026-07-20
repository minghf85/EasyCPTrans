import { useMemo, useState, useEffect } from "react";
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Image as TauriImage } from "@tauri-apps/api/image";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

import { ClipboardCard } from "./components/ClipboardCard";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { FilterBar } from "./components/FilterBar";
import { PasswordPromptModal } from "./components/PasswordPromptModal";
import { QuickTextEditorPage } from "./components/QuickTextEditorPage";
import { SearchHeader } from "./components/SearchHeader";
import { SettingsModal } from "./components/SettingsModal";
import { useClipboardWatcher, setInjectedOverrideSig } from "./hooks/useClipboardWatcher";
import { useGlobalShortcut } from "./hooks/useGlobalShortcut";
import { useHistory } from "./hooks/useHistory";
import { api } from "./lib/api";
import {
  applyFilters,
  aggregateTags,
  emptyFilter,
  isFilterActive,
  type Scope,
  type FilterState,
} from "./lib/filter";
import type { HistoryItem } from "./types";

const POLL_INTERVAL_MS = 500;
const DEFAULT_SHORTCUT = "CommandOrControl+Shift+E";

function MainApp() {
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
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [privacyAction, setPrivacyAction] = useState<{ id: number } | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [sessionPrivacyPassword, setSessionPrivacyPassword] = useState<string | null>(null);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, scope, activeTags, advancedFilters]);

  useEffect(() => {
    api.getConfig().then(cfg => {
        if (cfg) {
            if (cfg.shortcut) setShortcut(cfg.shortcut);
            if (typeof cfg.autoPaste === "boolean") setAutoPaste(cfg.autoPaste);
            if (typeof cfg.keepWindowOpen === "boolean") setKeepWindowOpen(cfg.keepWindowOpen);
            if (typeof cfg.alwaysOnTop === "boolean") setAlwaysOnTop(cfg.alwaysOnTop);
            if (typeof cfg.pageSize === "number") setPageSize(cfg.pageSize);
        }
    }).catch(e => console.error(e));
  }, []);

  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch((err) => {
      setErrorMsg("Set always-on-top failed: " + String(err));
    });
  }, [alwaysOnTop]);

  const { history } = useHistory(setErrorMsg);
  
  useClipboardWatcher(POLL_INTERVAL_MS, setErrorMsg);
  useGlobalShortcut(shortcut, setErrorMsg);

  const filterState = { search, scope, activeTags, ...advancedFilters };
  const filtered = useMemo(
    () => applyFilters(history, filterState as FilterState),
    [history, search, scope, activeTags, advancedFilters],
  );
  const hasFilters = isFilterActive(filterState);
  const tagCounts = useMemo(() => aggregateTags(history), [history]);
  const tagCountMap = useMemo(
    () => new Map(tagCounts.map(({ tag, count }) => [tag, count])),
    [tagCounts],
  );
  const currentPageItems = useMemo(
    () => filtered.slice(page * pageSize, (page + 1) * pageSize),
    [filtered, page, pageSize],
  );

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      if (prev.length === 1) {
        const active = prev[0];
        const count = tagCountMap.get(active) ?? 0;
        if (active !== tag && count <= 1) {
          return [tag];
        }
      }
      return [...prev, tag];
    });
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
      if ("isPrivate" in item && item.isPrivate) {
        setErrorMsg("该条目已加密，请先使用隐私按钮解密后再复制。");
        return;
      }

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

      let windowHidden = false;
      try {
        if (!keepWindowOpen && !alwaysOnTop) {
          await getCurrentWindow().hide();
          windowHidden = true;
        }
      } catch (err) {
        setErrorMsg("Hide error: " + String(err));
      }

      if (autoPaste && windowHidden) {
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

  const handleCopyFromUI = (item: HistoryItem | { id: number; content: string; contentType: "text" }) => {
    if ("id" in item && item.id > 0) {
      setSelectedId(item.id);
    }
    void handleCopy(item);
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

  const handleSettingsSaved = (settings: {
    shortcut: string;
    autoPaste: boolean;
    keepWindowOpen: boolean;
    alwaysOnTop: boolean;
    pageSize: number;
  }) => {
    setShortcut(settings.shortcut || DEFAULT_SHORTCUT);
    setAutoPaste(settings.autoPaste);
    setKeepWindowOpen(settings.keepWindowOpen);
    setAlwaysOnTop(settings.alwaysOnTop);
    setPageSize(settings.pageSize);
    setPage(0);
  };

  const handleToggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    try {
      const cfg = await api.getConfig();
      await api.setConfig({
        cachePath: cfg?.cachePath || "",
        shortcut: cfg?.shortcut || shortcut || DEFAULT_SHORTCUT,
        autoPaste: typeof cfg?.autoPaste === "boolean" ? cfg.autoPaste : autoPaste,
        keepWindowOpen:
          typeof cfg?.keepWindowOpen === "boolean" ? cfg.keepWindowOpen : keepWindowOpen,
        alwaysOnTop: next,
        pageSize: typeof cfg?.pageSize === "number" ? cfg.pageSize : pageSize,
        webdavSyncEnabled:
          typeof cfg?.webdavSyncEnabled === "boolean"
            ? cfg.webdavSyncEnabled
            : false,
        webdavUrl: cfg?.webdavUrl || "",
        webdavUsername: cfg?.webdavUsername || "",
        webdavPassword: cfg?.webdavPassword || "",
        deviceName: cfg?.deviceName || "",
      });
    } catch (err) {
      setErrorMsg("Save always-on-top failed: " + String(err));
    }
  };

  useEffect(() => {
    if (currentPageItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!currentPageItems.some((i) => i.id === selectedId)) {
      setSelectedId(currentPageItems[0].id);
    }
  }, [currentPageItems, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showSettings || privacyAction || taggingId !== null) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          return;
        }
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (currentPageItems.length === 0) return;
        const currentIndex = currentPageItems.findIndex((i) => i.id === selectedId);
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = Math.min(
          currentPageItems.length - 1,
          Math.max(0, baseIndex + delta),
        );
        const next = currentPageItems[nextIndex];
        setSelectedId(next.id);
        const element = document.getElementById(`history-item-${next.id}`);
        element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }

      if (event.key === "Enter") {
        if (currentPageItems.length === 0) return;
        const selected =
          currentPageItems.find((i) => i.id === selectedId) ?? currentPageItems[0];
        setSelectedId(selected.id);
        event.preventDefault();
        handleCopyFromUI(selected);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPageItems, selectedId, showSettings, privacyAction, taggingId, autoPaste, keepWindowOpen, alwaysOnTop]);

  const handleQuickEdit = (item: HistoryItem) => {
    if (item.contentType !== "text") return;
    window.location.hash = `/quick-edit?id=${item.id}`;
  };

  const handleEnablePrivacy = async (id: number) => {
    setPrivacyError(null);
    try {
      await api.protectItem(id);
    } catch (err) {
      setErrorMsg("开启隐私失败: " + String(err));
    }
  };

  const handleDisablePrivacy = (id: number) => {
    setPrivacyError(null);
    if (sessionPrivacyPassword) {
      setPrivacyBusy(true);
      api.unprotectItem(id, sessionPrivacyPassword)
        .catch((err) => {
          const msg = String(err);
          const isPasswordIssue = msg.includes("隐私密码错误") || msg.includes("解密失败");
          if (isPasswordIssue) {
            // 会话密码已失效（例如设置里修改了密码），要求重新输入一次
            setSessionPrivacyPassword(null);
            setPrivacyError("会话密码已失效，请重新输入隐私密码。");
            setPrivacyAction({ id });
            return;
          }
          setErrorMsg("隐私操作失败: " + msg);
        })
        .finally(() => {
          setPrivacyBusy(false);
        });
      return;
    }
    setPrivacyAction({ id });
  };

  const handlePrivacyConfirm = async (password: string) => {
    if (!privacyAction) return;
    const passwordToUse = password.trim();
    if (!passwordToUse) return;
    setPrivacyBusy(true);
    setPrivacyError(null);
    try {
      await api.unprotectItem(privacyAction.id, passwordToUse);
      setSessionPrivacyPassword(passwordToUse);
      setPrivacyAction(null);
    } catch (err) {
      const msg = String(err);
      setPrivacyError(msg);
      setErrorMsg("隐私操作失败: " + msg);
    } finally {
      setPrivacyBusy(false);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col text-slate-800 font-sans">
      <SearchHeader
        value={search}
        onChange={setSearch}
        onSettingsClick={() => setShowSettings(true)}
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
      />
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
            {currentPageItems.map((item, index) => (
              <ClipboardCard
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                isCopied={copiedId === item.id}
                isTagging={taggingId === item.id}
                tagInput={tagInput}
                showExtracts={index < 5}
                onCopy={handleCopyFromUI}
                onTogglePin={handleTogglePin}
                onDelete={handleDelete}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onEnablePrivacy={handleEnablePrivacy}
                onDisablePrivacy={handleDisablePrivacy}
                onStartTag={startTag}
                onStopTag={stopTag}
                onTagInputChange={setTagInput}
                onQuickEdit={handleQuickEdit}
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
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={handleSettingsSaved}
        />
      )}
      {privacyAction && (
        <PasswordPromptModal
          title="解密隐私内容"
          description="本次启动输入一次隐私密码后，后续解密会自动复用，重启应用后需重新输入。"
          confirmText="解密"
          busy={privacyBusy}
          error={privacyError}
          onClose={() => {
            if (privacyBusy) return;
            setPrivacyAction(null);
          }}
          onConfirm={handlePrivacyConfirm}
        />
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

function parseQuickEditRoute(hash: string): { matched: boolean; itemId: number | null } {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const [path, queryString = ""] = normalized.split("?");
  if (path !== "/quick-edit") {
    return { matched: false, itemId: null };
  }
  const params = new URLSearchParams(queryString);
  const id = Number(params.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return { matched: true, itemId: null };
  }
  return { matched: true, itemId: id };
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash || "");

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash || "");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  const route = parseQuickEditRoute(hash);
  if (route.matched) {
    return <QuickTextEditorPage itemId={route.itemId} />;
  }
  return <MainApp />;
}
