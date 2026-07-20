import { useEffect, useMemo, useRef, useState } from "react";
import { writeImage, writeText } from "tauri-plugin-clipboard-next-api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileCode2,
  FileImage,
  FileText,
  Files,
  Link2,
  Search,
  Settings2,
  Star,
} from "lucide-react";
import "./App.css";

import { ClipboardCard } from "./components/ClipboardCard";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { PasswordPromptModal } from "./components/PasswordPromptModal";
import { QuickTextEditorPage } from "./components/QuickTextEditorPage";
import { SettingsModal } from "./components/SettingsModal";
import { useClipboardWatcher, setInjectedOverrideSig } from "./hooks/useClipboardWatcher";
import { useGlobalShortcut } from "./hooks/useGlobalShortcut";
import { useHistory } from "./hooks/useHistory";
import { api } from "./lib/api";
import {
  aggregateTags,
  applyFilters,
  emptyFilter,
  isFilterActive,
  type FilterState,
  type Scope,
} from "./lib/filter";
import { mockHistory } from "./lib/mock";
import type { HistoryItem } from "./types";

const DEFAULT_SHORTCUT = "CommandOrControl+Shift+E";
const TAB_LIST: Array<{
  key: Scope | "settings";
  label: string;
  dotClass: string;
  icon: typeof FileText;
}> = [
  { key: "all", label: "All", dotClass: "dot-all", icon: FileText },
  { key: "text", label: "Text", dotClass: "dot-text", icon: FileText },
  { key: "image", label: "Images", dotClass: "dot-images", icon: FileImage },
  { key: "file", label: "Files", dotClass: "dot-files", icon: Files },
  { key: "pinned", label: "Important", dotClass: "dot-important", icon: Star },
  { key: "url", label: "Links", dotClass: "dot-links", icon: Link2 },
  { key: "code", label: "Code", dotClass: "dot-code", icon: FileCode2 },
  { key: "settings", label: "Settings", dotClass: "dot-settings", icon: Settings2 },
];

function MainApp() {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [activeView, setActiveView] = useState<Scope | "settings">("all");
  const [advancedFilters, setAdvancedFilters] = useState<Partial<FilterState>>({
    timeRange: [null, null],
    textLen: [null, null],
    fileSize: [null, null],
  });
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [taggingId, setTaggingId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [autoPaste, setAutoPaste] = useState(true);
  const [keepWindowOpen, setKeepWindowOpen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [historyLimit, setHistoryLimit] = useState(5000);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cardRows, setCardRows] = useState(1);
  const [privacyAction, setPrivacyAction] = useState<{ id: number } | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [sessionPrivacyPassword, setSessionPrivacyPassword] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        if (!cfg) return;
        if (cfg.shortcut) setShortcut(cfg.shortcut);
        if (typeof cfg.autoPaste === "boolean") setAutoPaste(cfg.autoPaste);
        if (typeof cfg.keepWindowOpen === "boolean") setKeepWindowOpen(cfg.keepWindowOpen);
        if (typeof cfg.alwaysOnTop === "boolean") setAlwaysOnTop(cfg.alwaysOnTop);
        if (typeof cfg.pageSize === "number") setPageSize(cfg.pageSize);
        if (typeof cfg.historyLimit === "number") setHistoryLimit(cfg.historyLimit);
      })
      .catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch((err) => {
      setErrorMsg("Set always-on-top failed: " + String(err));
    });
  }, [alwaysOnTop]);

  useEffect(() => {
    setPage(0);
  }, [search, scope, activeTags, advancedFilters, activeView]);

  const { history } = useHistory(historyLimit, setErrorMsg);
  useClipboardWatcher(0, setErrorMsg);
  useGlobalShortcut(shortcut, setErrorMsg);

  const sourceHistory = history.length > 0 ? history : mockHistory;
  const filterState = { search, scope, activeTags, ...advancedFilters };
  const filtered = useMemo(
    () => applyFilters(sourceHistory, filterState as FilterState),
    [sourceHistory, search, scope, activeTags, advancedFilters],
  );

  const tagCounts = useMemo(() => aggregateTags(sourceHistory), [sourceHistory]);
  const tagCountMap = useMemo(
    () => new Map(tagCounts.map(({ tag, count }) => [tag, count])),
    [tagCounts],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPageItems = useMemo(
    () => filtered.slice(page * pageSize, (page + 1) * pageSize),
    [filtered, page, pageSize],
  );
  const hasFilters = isFilterActive(filterState as FilterState);
  const cardStripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bindHorizontalWheel = (elementId: string) => {
      const node = document.getElementById(elementId);
      if (!node) return () => {};
      const onWheel = (event: WheelEvent) => {
        const target = event.target as HTMLElement | null;
        const body = target?.closest(".easycp-card-body") as HTMLElement | null;
        if (body && body.scrollHeight > body.clientHeight) return;
        const meta = target?.closest(".easycp-meta-strip") as HTMLElement | null;
        if (meta && meta.scrollWidth > meta.clientWidth) return;
        const menu = target?.closest(".easycp-card-menu") as HTMLElement | null;
        if (menu && menu.scrollHeight > menu.clientHeight) return;
        const tags = target?.closest(".easycp-tags-wrap") as HTMLElement | null;
        if (tags && tags.scrollWidth > tags.clientWidth) return;

        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
        if (delta === 0) return;
        event.preventDefault();
        node.scrollLeft += delta;
      };
      node.addEventListener("wheel", onWheel, { passive: false });
      return () => node.removeEventListener("wheel", onWheel);
    };

    const unbindTabs = bindHorizontalWheel("filter-scroll");
    const unbindCards = bindHorizontalWheel("card-scroll");
    return () => {
      unbindTabs();
      unbindCards();
    };
  }, [activeView, currentPageItems.length]);

  useEffect(() => {
    const node = cardStripRef.current;
    if (!node || activeView === "settings") return;

    const CARD_HEIGHT = 220;
    const GAP = 12;
    const VERTICAL_PADDING = 9;
    const SCROLLBAR_GUTTER = 14;
    const updateRows = () => {
      const availableHeight = Math.max(
        0,
        node.clientHeight - VERTICAL_PADDING - SCROLLBAR_GUTTER,
      );
      const nextRows = Math.max(
        1,
        Math.floor((availableHeight + GAP) / (CARD_HEIGHT + GAP)),
      );
      setCardRows((prev) => (prev === nextRows ? prev : nextRows));
    };

    updateRows();
    const observer = new ResizeObserver(updateRows);
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeView]);

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  useEffect(() => {
    if (activeView === "settings") return;
    if (currentPageItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!currentPageItems.some((item) => item.id === selectedId)) {
      setSelectedId(currentPageItems[0].id);
    }
  }, [activeView, currentPageItems, selectedId]);

  const handleScrollTabs = (direction: "left" | "right") => {
    const node = document.getElementById("filter-scroll");
    if (!node) return;
    node.scrollBy({ left: direction === "left" ? -140 : 140, behavior: "smooth" });
  };

  const handlePageChange = (nextPage: number) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, nextPage));
    setPage(clamped);
    setSelectedId(null);
    const strip = document.getElementById("card-scroll");
    if (strip) strip.scrollLeft = 0;
  };

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length === 1) {
        const active = prev[0];
        const count = tagCountMap.get(active) ?? 0;
        if (active !== tag && count <= 1) return [tag];
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
      fileSize: [null, null],
    });
    setActiveView("all");
  };

  const writeItemToClipboard = async (
    item: HistoryItem | { id: number; content: string; contentType: "text" },
  ) => {
    if ("isPrivate" in item && item.isPrivate) {
      throw new Error("This item is private. Unlock it before copying.");
    }

    if (item.contentType === "text") {
      await writeText(item.content);
      setInjectedOverrideSig(item.content);
      return;
    }

    if (item.contentType === "image") {
      const size = await writeImageDataUrl(item.content);
      if (size) setInjectedOverrideSig(`img_${size.width}x${size.height}`);
    }
  };

  const handleCopy = async (
    item: HistoryItem | { id: number; content: string; contentType: "text" },
  ) => {
    try {
      await writeItemToClipboard(item);

      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1600);

      if ("id" in item && item.id > 0) {
        void api.markUsed(item.id).catch(console.error);
      }

      let windowHidden = false;
      if (!keepWindowOpen && !alwaysOnTop) {
        await getCurrentWindow().hide();
        windowHidden = true;
      }

      if (autoPaste && windowHidden) {
        window.setTimeout(async () => {
          try {
            await api.simulatePaste();
          } catch (err) {
            setErrorMsg("Paste simulation error: " + String(err));
          }
        }, 120);
      }
    } catch (err) {
      setErrorMsg("Copy error: " + String(err));
    }
  };

  const handlePaste = async (item: HistoryItem) => {
    try {
      await writeItemToClipboard(item);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1600);
      setSelectedId(item.id);
      void api.markUsed(item.id).catch(console.error);

      if (!alwaysOnTop) {
        await getCurrentWindow().hide().catch(() => {});
      }

      window.setTimeout(async () => {
        try {
          await api.simulatePaste();
        } catch (err) {
          setErrorMsg("Paste simulation error: " + String(err));
        }
      }, 90);
    } catch (err) {
      setErrorMsg("Paste error: " + String(err));
    }
  };

  const handleCopyFromUI = (
    item: HistoryItem | { id: number; content: string; contentType: "text" },
  ) => {
    if ("id" in item && item.id > 0) setSelectedId(item.id);
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
    const item = sourceHistory.find((i) => i.id === id);
    if (!item || item.tags.includes(trimmed)) return;
    try {
      await api.setTags(id, [...item.tags, trimmed]);
    } catch (err) {
      setErrorMsg("Add tag error: " + String(err));
    }
  };

  const handleRemoveTag = async (id: number, tag: string) => {
    const item = sourceHistory.find((i) => i.id === id);
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
    historyLimit: number;
    webdavUrl: string;
    webdavUsername: string;
    webdavSyncEnabled: boolean;
    deviceName: string;
  }) => {
    setShortcut(settings.shortcut || DEFAULT_SHORTCUT);
    setAutoPaste(settings.autoPaste);
    setKeepWindowOpen(settings.keepWindowOpen);
    setAlwaysOnTop(settings.alwaysOnTop);
    setPageSize(settings.pageSize);
    setHistoryLimit(settings.historyLimit);
  };

  const handleQuickEdit = (item: HistoryItem) => {
    if (item.contentType !== "text") return;
    window.location.hash = `/quick-edit?id=${item.id}`;
  };

  const handleEnablePrivacy = async (id: number) => {
    setPrivacyError(null);
    try {
      await api.protectItem(id);
    } catch (err) {
      setErrorMsg("Enable privacy failed: " + String(err));
    }
  };

  const handleDisablePrivacy = (id: number) => {
    setPrivacyError(null);
    if (sessionPrivacyPassword) {
      setPrivacyBusy(true);
      api
        .unprotectItem(id, sessionPrivacyPassword)
        .catch((err) => {
          const msg = String(err);
          if (msg.includes("password") || msg.includes("decrypt")) {
            setSessionPrivacyPassword(null);
            setPrivacyError("Session password expired. Enter it again.");
            setPrivacyAction({ id });
            return;
          }
          setErrorMsg("Privacy action failed: " + msg);
        })
        .finally(() => setPrivacyBusy(false));
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
      setErrorMsg("Privacy action failed: " + msg);
    } finally {
      setPrivacyBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (privacyAction) return;
        if (taggingId !== null) {
          stopTag();
          return;
        }
        if (searchOpen) {
          setSearchOpen(false);
          setSearch("");
          return;
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (activeView === "settings" || privacyAction || taggingId !== null) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (currentPageItems.length === 0) return;
        const currentIndex = currentPageItems.findIndex((item) => item.id === selectedId);
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = Math.min(currentPageItems.length - 1, Math.max(0, baseIndex + delta));
        const next = currentPageItems[nextIndex];
        setSelectedId(next.id);
        document.getElementById(`history-item-${next.id}`)?.scrollIntoView({
          block: "nearest",
          behavior: "auto",
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (currentPageItems.length === 0) return;
        const selected =
          currentPageItems.find((item) => item.id === selectedId) ?? currentPageItems[0];
        setSelectedId(selected.id);
        handleCopyFromUI(selected);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, currentPageItems, privacyAction, searchOpen, selectedId, taggingId]);

  const onTabClick = (key: Scope | "settings") => {
    setActiveView(key);
    if (key !== "settings") {
      setScope(key);
    }
  };

  return (
    <div className="easycp-shell">
      <div
        className="easycp-drag-edge easycp-drag-edge-top"
        data-tauri-drag-region
        onMouseDown={() => {
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      <div
        className="easycp-drag-edge easycp-drag-edge-left"
        data-tauri-drag-region
        onMouseDown={() => {
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      <div
        className="easycp-drag-edge easycp-drag-edge-right"
        data-tauri-drag-region
        onMouseDown={() => {
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />

      <section className="easycp-toolbar">
          <div className="easycp-search-wrap">
            <button
              className="easycp-search-btn"
              title="Search"
              onClick={() => {
                const next = !searchOpen;
                setSearchOpen(next);
                if (!next) setSearch("");
              }}
            >
              <Search className="h-4 w-4" />
            </button>
            <div className={`easycp-search-expand ${searchOpen ? "open" : ""}`}>
              <input
                autoFocus={searchOpen}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clipboard history..."
              />
            </div>
          </div>

          <button className="easycp-scroll-arrow" onClick={() => handleScrollTabs("left")}>
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="easycp-filter-scroll" id="filter-scroll">
            {TAB_LIST.map(({ key, label, dotClass, icon: Icon }) => {
              const active = activeView === key;
              return (
                <button
                  key={key}
                  className={`easycp-filter-tab ${active ? "active" : ""}`}
                  onClick={() => onTabClick(key)}
                >
                  <span className={`easycp-tab-dot ${dotClass}`} />
                  <span>{label}</span>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>

          <button className="easycp-scroll-arrow" onClick={() => handleScrollTabs("right")}>
            <ChevronRight className="h-4 w-4" />
          </button>
      </section>

      <ErrorBanner message={errorMsg} />

      {activeView !== "settings" && hasFilters && (
        <div className="easycp-activebar">
          <div className="easycp-activebar-left">
            <span>
              {filtered.length} / {sourceHistory.length}
            </span>
            {activeTags.map((tag) => (
              <button key={tag} className="easycp-tagchip" onClick={() => toggleTag(tag)}>
                #{tag}
              </button>
            ))}
          </div>
          <button className="easycp-clear-btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      <main
        className={`easycp-main ${
          activeView === "settings" ? "easycp-main-settings" : "easycp-main-cards"
        }`}
      >
        {activeView === "settings" ? (
          <SettingsModal onSaved={handleSettingsSaved} />
        ) : filtered.length === 0 ? (
          <EmptyState
            filtered={hasFilters && sourceHistory.length > 0}
            onClear={hasFilters ? clearFilters : undefined}
          />
        ) : (
          <div
            ref={cardStripRef}
            className="easycp-card-strip"
            id="card-scroll"
            style={{ ["--card-rows" as string]: String(cardRows) }}
          >
            {page > 0 && (
              <button className="easycp-page-card" onClick={() => handlePageChange(page - 1)}>
                <Ellipsis className="h-8 w-8" />
                <span>Load previous</span>
                <small>
                  {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)}
                </small>
              </button>
            )}
            {currentPageItems.map((item) => (
              <ClipboardCard
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                isCopied={copiedId === item.id}
                isTagging={taggingId === item.id}
                tagInput={tagInput}
                onCopy={handleCopyFromUI}
                onPaste={handlePaste}
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
              />
            ))}
            {page < totalPages - 1 && (
              <button className="easycp-page-card" onClick={() => handlePageChange(page + 1)}>
                <Ellipsis className="h-8 w-8" />
                <span>Load next</span>
                <small>
                  {page * pageSize + currentPageItems.length + 1}-
                  {Math.min((page + 2) * pageSize, filtered.length)}
                </small>
              </button>
            )}
          </div>
        )}
      </main>

      {privacyAction && (
        <PasswordPromptModal
          title="Unlock private item"
          description="Enter the privacy password once for this session. You will need to re-enter it after restarting the app."
          confirmText="Unlock"
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
  const pngDataUrl = canvas.toDataURL("image/png");
  const imagePath = await api.saveTempImage(pngDataUrl);
  await writeImage(imagePath);
  return { width: htmlImg.width, height: htmlImg.height };
}

function parseQuickEditRoute(hash: string): { matched: boolean; itemId: number | null } {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const [path, queryString = ""] = normalized.split("?");
  if (path !== "/quick-edit") return { matched: false, itemId: null };
  const params = new URLSearchParams(queryString);
  const id = Number(params.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { matched: true, itemId: null };
  return { matched: true, itemId: id };
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash || "");

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || "");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const route = parseQuickEditRoute(hash);
  if (route.matched) return <QuickTextEditorPage itemId={route.itemId} />;
  return <MainApp />;
}
