import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { writeFiles, writeImage, writeText } from "tauri-plugin-clipboard-x-api";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileCode2,
  FileImage,
  FileText,
  Files,
  GripHorizontal,
  Link2,
  Monitor,
  Pin,
  RefreshCw,
  Tags,
  Search,
  Settings2,
  Square,
  Star,
} from "lucide-react";
import "./App.css";

import { ClipboardCard } from "./components/ClipboardCard";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { PasswordPromptModal } from "./components/PasswordPromptModal";
import { QuickTextEditorPage } from "./components/QuickTextEditorPage";
import { SettingsModal } from "./components/SettingsModal";
import type { SettingsModalHandle } from "./components/SettingsModal";
import { TagManagementPage } from "./components/TagManagementPage";
import { resetClipboardStack, useClipboardWatcher, setInjectedOverrideSig } from "./hooks/useClipboardWatcher";
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
import type { HistoryItem, ManagedTag } from "./types";

const DEFAULT_SHORTCUT = "CommandOrControl+Shift+V";
const DEFAULT_QUEUE_STEP_SHORTCUT = "CommandOrControl+Alt+V";
const DEFAULT_QUICK_PASTE_PREFIX = "CommandOrControl+Shift";
const DEFAULT_STACK_SHORTCUT_PREFIX = "CommandOrControl+Alt";
const DEFAULT_WORD_TRANSLATE_SHORTCUT = "Alt+C";
const DEFAULT_ITEM_TAG_SHORTCUT = "T";
const DEFAULT_ITEM_PRIVATE_SHORTCUT = "M";
const DEFAULT_ITEM_PIN_SHORTCUT = "P";
const DEFAULT_ITEM_DELETE_SHORTCUT = "Delete";
const DEFAULT_TAG_COLOR = "#0f6cbd";
const SYSTEM_TAGS: Array<ManagedTag & { key: ActiveView }> = [
  { id: "sys-text", name: "Text", common: true, color: "#0078d4", system: true, key: "text" },
  { id: "sys-image", name: "Image", common: true, color: "#107c10", system: true, key: "image" },
  { id: "sys-file", name: "File", common: true, color: "#7b4f9d", system: true, key: "file" },
  { id: "sys-pinned", name: "Pinned", common: true, color: "#d83b01", system: true, key: "pinned" },
];
const FUNCTIONAL_TAGS: ManagedTag[] = [
  { id: "sys-word", name: "Word", common: true, color: "#0067c0", system: true },
  { id: "sys-private", name: "Private", common: true, color: "#a4262c", system: true },
];
const LEGACY_SYSTEM_TAG_IDS = new Set(["sys-url", "sys-code"]);
const LEGACY_SYSTEM_TAG_NAMES = new Set(["important", "links", "code"]);
const BASE_TAB_LIST: Array<{
  key: Scope;
  label: string;
  dotClass: string;
  icon: typeof FileText;
}> = [
  { key: "all", label: "All", dotClass: "dot-all", icon: FileText },
];

type ActiveView = Scope | "tag-selector" | "tag-manager" | "settings" | `tag:${string}`;

function deviceTagId(name: string) {
  return `sys-device-${name.trim().toLowerCase()}`;
}

function isReservedFunctionalTagName(name: string) {
  return ["text", "image", "file", "word", "private", "privacy", "pinned"].includes(name.trim().toLowerCase());
}

function isDeviceSystemTag(tag: ManagedTag) {
  return tag.id?.startsWith("sys-device-") ?? false;
}

function sanitizeManagedTags(tags: ManagedTag[]) {
  const normalized = new Map<string, ManagedTag>();

  for (const tag of tags) {
    const trimmedName = tag.name.trim();
    if (!trimmedName) continue;

    const lowerId = tag.id?.toLowerCase() ?? "";
    const lowerName = trimmedName.toLowerCase();

    if (LEGACY_SYSTEM_TAG_IDS.has(lowerId) || LEGACY_SYSTEM_TAG_NAMES.has(lowerName)) {
      continue;
    }

    let next: ManagedTag = {
      id: tag.id,
      name: trimmedName,
      common: Boolean(tag.common),
      color: tag.color?.trim() || DEFAULT_TAG_COLOR,
      system: Boolean(tag.system),
    };

    if (lowerId === "sys-text" || lowerName === "text") {
      next = { ...next, id: "sys-text", name: "Text", system: true };
    } else if (lowerId === "sys-image" || lowerName === "images" || lowerName === "image") {
      next = { ...next, id: "sys-image", name: "Image", system: true };
    } else if (lowerId === "sys-file" || lowerName === "files" || lowerName === "file") {
      next = { ...next, id: "sys-file", name: "File", system: true };
    } else if (lowerId === "sys-pinned" || lowerName === "pinned") {
      next = { ...next, id: "sys-pinned", name: "Pinned", system: true };
    } else if (lowerId === "sys-word" || lowerName === "word") {
      next = { ...next, id: "sys-word", name: "Word", system: true };
    } else if (lowerId === "sys-private" || lowerName === "private" || lowerName === "privacy") {
      next = { ...next, id: "sys-private", name: "Private", system: true };
    } else if (lowerId.startsWith("sys-device-")) {
      next = { ...next, system: true };
    } else if (next.system) {
      next = { ...next, id: undefined, system: false };
    }

    normalized.set(next.system ? next.name.toLowerCase() : next.id ?? next.name.toLowerCase(), next);
  }

  return Array.from(normalized.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeShortcutValue(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed || fallback;
}

function normalizeLocalShortcut(value: string) {
  return value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ctrl", "control", "commandorcontrol", "cmdorctrl"].includes(lower)) return "CommandOrControl";
      if (lower === "shift") return "Shift";
      if (["alt", "option"].includes(lower)) return "Alt";
      if (["super", "meta", "win", "windows", "command", "cmd"].includes(lower)) return "Super";
      if (lower === "delete" || lower === "del") return "Delete";
      if (lower === "escape" || lower === "esc") return "Esc";
      if (part.length === 1) return part.toUpperCase();
      return part;
    })
    .join("+");
}

function eventToLocalShortcut(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.key === "Delete") parts.push("Delete");
  else if (event.key === "Escape") parts.push("Esc");
  else if (!["Control", "Meta", "Alt", "Shift"].includes(event.key)) {
    parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
  }
  return normalizeLocalShortcut(parts.join("+"));
}

function migrateQuickPastePrefix(value: string) {
  return value === "Super+Shift" ? DEFAULT_QUICK_PASTE_PREFIX : value;
}

function MainApp() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const suppressBlurHideUntilRef = useRef(0);
  const blurHideTimerRef = useRef<number | null>(null);
  const edgeInteractingRef = useRef(false);
  const pendingSelectionRef = useRef<{ page: number; row: number; edge: "start" | "end" } | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [activeView, setActiveView] = useState<ActiveView>("all");
  const [advancedFilters, setAdvancedFilters] = useState<Partial<FilterState>>({
    timeRange: [null, null],
    textLen: [null, null],
    fileSize: [null, null],
  });
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [autoPaste, setAutoPaste] = useState(true);
  const [keepWindowOpen, setKeepWindowOpen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [itemTagShortcut, setItemTagShortcut] = useState(DEFAULT_ITEM_TAG_SHORTCUT);
  const [itemPrivateShortcut, setItemPrivateShortcut] = useState(DEFAULT_ITEM_PRIVATE_SHORTCUT);
  const [itemPinShortcut, setItemPinShortcut] = useState(DEFAULT_ITEM_PIN_SHORTCUT);
  const [itemDeleteShortcut, setItemDeleteShortcut] = useState(DEFAULT_ITEM_DELETE_SHORTCUT);
  const [pageSize, setPageSize] = useState(50);
  const [historyLimit, setHistoryLimit] = useState(5000);
  const [managedTags, setManagedTags] = useState<ManagedTag[]>([]);
  const [tagManageBusy, setTagManageBusy] = useState(false);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [quickTagItemId, setQuickTagItemId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [queuedIds, setQueuedIds] = useState<number[]>([]);
  const [cardRows, setCardRows] = useState(1);
  const [windowLayoutTick, setWindowLayoutTick] = useState(0);
  const [privacyAction, setPrivacyAction] = useState<{ id: number } | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [sessionPrivacyPassword, setSessionPrivacyPassword] = useState<string | null>(null);
  const settingsModalRef = useRef<SettingsModalHandle | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        if (!cfg) return;
        const nextShortcutRaw = normalizeShortcutValue(cfg.shortcut, DEFAULT_SHORTCUT);
        const nextShortcut =
          nextShortcutRaw === "Super+Shift+V" ? DEFAULT_SHORTCUT : nextShortcutRaw;
        const nextQueueStepShortcut = normalizeShortcutValue(
          cfg.queueStepShortcut,
          DEFAULT_QUEUE_STEP_SHORTCUT,
        );
        const nextQuickPastePrefix = migrateQuickPastePrefix(
          normalizeShortcutValue(cfg.quickPastePrefix, DEFAULT_QUICK_PASTE_PREFIX),
        );
        const nextStackShortcutPrefix = normalizeShortcutValue(
          cfg.stackShortcutPrefix,
          DEFAULT_STACK_SHORTCUT_PREFIX,
        );
        const nextWordTranslateShortcut = normalizeShortcutValue(
          cfg.wordTranslateShortcut,
          DEFAULT_WORD_TRANSLATE_SHORTCUT,
        );
        const nextItemTagShortcut = normalizeShortcutValue(cfg.itemTagShortcut, DEFAULT_ITEM_TAG_SHORTCUT);
        const nextItemPrivateShortcut = normalizeShortcutValue(cfg.itemPrivateShortcut, DEFAULT_ITEM_PRIVATE_SHORTCUT);
        const nextItemPinShortcut = normalizeShortcutValue(cfg.itemPinShortcut, DEFAULT_ITEM_PIN_SHORTCUT);
        const nextItemDeleteShortcut = normalizeShortcutValue(cfg.itemDeleteShortcut, DEFAULT_ITEM_DELETE_SHORTCUT);
        if (
          nextShortcut !== (cfg.shortcut ?? "") ||
          nextQueueStepShortcut !== (cfg.queueStepShortcut ?? "") ||
          nextQuickPastePrefix !== (cfg.quickPastePrefix ?? "") ||
          nextStackShortcutPrefix !== (cfg.stackShortcutPrefix ?? "") ||
          nextWordTranslateShortcut !== (cfg.wordTranslateShortcut ?? "") ||
          nextItemTagShortcut !== (cfg.itemTagShortcut ?? "") ||
          nextItemPrivateShortcut !== (cfg.itemPrivateShortcut ?? "") ||
          nextItemPinShortcut !== (cfg.itemPinShortcut ?? "") ||
          nextItemDeleteShortcut !== (cfg.itemDeleteShortcut ?? "")
        ) {
          void api.setConfig({
            shortcut: nextShortcut,
            queueStepShortcut: nextQueueStepShortcut,
            quickPastePrefix: nextQuickPastePrefix,
            stackShortcutPrefix: nextStackShortcutPrefix,
            wordTranslateShortcut: nextWordTranslateShortcut,
            itemTagShortcut: nextItemTagShortcut,
            itemPrivateShortcut: nextItemPrivateShortcut,
            itemPinShortcut: nextItemPinShortcut,
            itemDeleteShortcut: nextItemDeleteShortcut,
          }).catch(console.error);
        }
        setItemTagShortcut(normalizeLocalShortcut(nextItemTagShortcut));
        setItemPrivateShortcut(normalizeLocalShortcut(nextItemPrivateShortcut));
        setItemPinShortcut(normalizeLocalShortcut(nextItemPinShortcut));
        setItemDeleteShortcut(normalizeLocalShortcut(nextItemDeleteShortcut));
        if (typeof cfg.autoPaste === "boolean") setAutoPaste(cfg.autoPaste);
        if (typeof cfg.keepWindowOpen === "boolean") setKeepWindowOpen(cfg.keepWindowOpen);
        if (typeof cfg.alwaysOnTop === "boolean") setAlwaysOnTop(cfg.alwaysOnTop);
        if (typeof cfg.pageSize === "number") setPageSize(cfg.pageSize);
        if (typeof cfg.historyLimit === "number") setHistoryLimit(cfg.historyLimit);
        if (Array.isArray(cfg.managedTags)) {
          const sanitized = sanitizeManagedTags(cfg.managedTags);
          setManagedTags(sanitized);
          if (JSON.stringify(sanitized) !== JSON.stringify(cfg.managedTags)) {
            void api.setConfig({ managedTags: sanitized }).catch(console.error);
          }
        }
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

  const { history, reload: reloadHistory } = useHistory(historyLimit, setErrorMsg);
  useClipboardWatcher(0, setErrorMsg);
  const sourceHistory = history;
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
  const allKnownTags = useMemo(() => {
    const map = new Map<string, ManagedTag>();
    const deviceNames = new Set(
      sourceHistory
        .map((item) => item.metadata?.deviceName?.[0]?.trim())
        .filter((name): name is string => Boolean(name)),
    );
    for (const deviceName of deviceNames) {
      map.set(deviceName.toLowerCase(), {
        id: deviceTagId(deviceName),
        name: deviceName,
        common: true,
        color: "#8764b8",
        system: true,
      });
    }
    for (const tag of SYSTEM_TAGS) {
      map.set(tag.name.toLowerCase(), { ...tag });
    }
    for (const tag of FUNCTIONAL_TAGS) {
      map.set(tag.name.toLowerCase(), { ...tag });
    }
    for (const tag of managedTags) {
      const cleaned = tag.name.trim();
      if (!cleaned) continue;
      const key = tag.system ? cleaned.toLowerCase() : tag.id ?? cleaned.toLowerCase();
      const base = map.get(key);
      map.set(key, {
        ...base,
        ...tag,
        name: cleaned,
        common: Boolean(tag.common),
        color: tag.color?.trim() || base?.color || DEFAULT_TAG_COLOR,
      });
    }
    for (const { tag } of tagCounts) {
      const cleaned = tag.trim();
      const lower = cleaned.toLowerCase();
      if (
        cleaned &&
        !LEGACY_SYSTEM_TAG_NAMES.has(lower) &&
        !map.has(lower)
      ) {
        const isDeviceTag = deviceNames.has(cleaned);
        map.set(cleaned.toLowerCase(), {
          id: isDeviceTag ? deviceTagId(cleaned) : undefined,
          name: cleaned,
          common: isDeviceTag,
          color: isDeviceTag ? "#8764b8" : DEFAULT_TAG_COLOR,
          system: isDeviceTag,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [managedTags, sourceHistory, tagCounts]);
  const tabList = useMemo(() => {
    const deviceNames = new Set(
      sourceHistory
        .map((item) => item.metadata?.deviceName?.[0]?.trim())
        .filter((name): name is string => Boolean(name)),
    );
    const systemTabs = SYSTEM_TAGS.map((systemTag) => {
      const current = allKnownTags.find((tag) => tag.id === systemTag.id) ?? systemTag;
      return current.common
        ? {
            key: systemTag.key,
            label: current.name,
            dotClass: "dot-tag",
            icon:
              systemTag.key === "image"
                ? FileImage
                : systemTag.key === "file"
                  ? Files
                  : systemTag.key === "pinned"
                    ? Star
                    : systemTag.key === "url"
                      ? Link2
                      : systemTag.key === "code"
                        ? FileCode2
                        : FileText,
          }
        : null;
    }).filter(Boolean) as Array<{ key: ActiveView; label: string; dotClass: string; icon: typeof FileText }>;
    const deviceTabs = allKnownTags
      .filter((tag) => tag.system && deviceNames.has(tag.name))
      .map((tag) => ({
        key: `tag:${tag.name}` as const,
        label: `#${tag.name}`,
        dotClass: "dot-device",
        icon: Monitor,
      }));
    const functionalTabs = allKnownTags
      .filter((tag) => tag.system && (tag.id === "sys-word" || tag.id === "sys-private"))
      .filter((tag) => tag.common)
      .map((tag) => ({
        key: `tag:${tag.name}` as const,
        label: `#${tag.name}`,
        dotClass: "dot-tag",
        icon: Tags,
      }));
    const customCommonTabs = allKnownTags
      .filter((tag) => tag.common && !tag.system)
      .map((tag) => ({
        key: `tag:${tag.name}` as const,
        label: `#${tag.name}`,
        dotClass: "dot-tag",
        icon: Tags,
      }));
    return [
      ...BASE_TAB_LIST,
      ...systemTabs,
      ...deviceTabs,
      ...functionalTabs,
      ...customCommonTabs,
      { key: "tag-selector" as const, label: "Tags", dotClass: "dot-tag", icon: Tags },
      { key: "tag-manager" as const, label: "Tag Admin", dotClass: "dot-tag", icon: Tags },
      { key: "settings" as const, label: "Settings", dotClass: "dot-settings", icon: Settings2 },
    ];
  }, [allKnownTags, sourceHistory]);
  const selectableTags = useMemo(
    () => allKnownTags.filter((tag) => !tag.system),
    [allKnownTags],
  );
  const tagColorMap = useMemo(
    () =>
      Object.fromEntries(
        allKnownTags.map((tag) => [tag.name.toLowerCase(), tag.color || DEFAULT_TAG_COLOR]),
      ),
    [allKnownTags],
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
        const body = target?.closest(".eacptrans-card-body") as HTMLElement | null;
        if (body && body.scrollHeight > body.clientHeight) return;
        const meta = target?.closest(".eacptrans-meta-strip") as HTMLElement | null;
        if (meta && meta.scrollWidth > meta.clientWidth) return;
        const menu = target?.closest(".eacptrans-card-menu") as HTMLElement | null;
        if (menu && menu.scrollHeight > menu.clientHeight) return;
        const tags = target?.closest(".eacptrans-tags-wrap") as HTMLElement | null;
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
    if (!node || activeView === "settings" || activeView === "tag-manager") return;

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
  }, [activeView, windowLayoutTick]);

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  useEffect(() => {
    if (activeView === "settings" || activeView === "tag-manager") return;
    if (currentPageItems.length === 0) {
      setSelectedId(null);
      return;
    }
    const pending = pendingSelectionRef.current;
    if (pending && pending.page === page) {
      const rows = Math.max(1, cardRows);
      const total = currentPageItems.length;
      const totalColumns = Math.ceil(total / rows);
      const targetColumn = pending.edge === "start" ? 0 : Math.max(0, totalColumns - 1);
      const columnStart = targetColumn * rows;
      const columnLength = Math.min(rows, Math.max(0, total - columnStart));
      const targetIndex = columnStart + Math.max(0, Math.min(pending.row, Math.max(0, columnLength - 1)));
      const targetItem = currentPageItems[targetIndex] ?? currentPageItems[0];
      pendingSelectionRef.current = null;
      setSelectedId(targetItem.id);
      window.requestAnimationFrame(() => {
        document.getElementById(`history-item-${targetItem.id}`)?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "auto",
        });
      });
      return;
    }
    if (!currentPageItems.some((item) => item.id === selectedId)) {
      setSelectedId(currentPageItems[0].id);
    }
  }, [activeView, currentPageItems, selectedId, page, cardRows]);

  useEffect(() => {
    const ids = new Set(sourceHistory.map((item) => item.id));
    setQueuedIds((prev) => prev.filter((id) => ids.has(id)));
  }, [sourceHistory]);

  const handleScrollTabs = (direction: "left" | "right") => {
    const node = document.getElementById("filter-scroll");
    if (!node) return;
    node.scrollBy({ left: direction === "left" ? -140 : 140, behavior: "smooth" });
  };

  const handlePageChange = (nextPage: number, pendingSelection?: { row: number; edge: "start" | "end" }) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, nextPage));
    pendingSelectionRef.current = pendingSelection ? { page: clamped, ...pendingSelection } : null;
    setPage(clamped);
    setSelectedId(null);
    const strip = document.getElementById("card-scroll");
    if (strip) strip.scrollLeft = 0;
  };

  const markTransientWindowInteraction = (durationMs = 2400) => {
    suppressBlurHideUntilRef.current = Date.now() + durationMs;
  };

  const navigateGridSelection = (direction: "left" | "right" | "up" | "down") => {
    if (currentPageItems.length === 0) return;

    const currentIndex = currentPageItems.findIndex((item) => item.id === selectedId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const rows = Math.max(1, cardRows);
    const total = currentPageItems.length;
    const currentColumn = Math.floor(safeIndex / rows);
    const currentRow = safeIndex % rows;
    const totalColumns = Math.ceil(total / rows);

    const getColumnLength = (column: number) => {
      if (column < 0 || column >= totalColumns) return 0;
      return Math.min(rows, Math.max(0, total - column * rows));
    };

    const getIndex = (column: number, row: number) => {
      const columnLength = getColumnLength(column);
      if (columnLength <= 0) return safeIndex;
      const nextRow = Math.max(0, Math.min(row, columnLength - 1));
      return column * rows + nextRow;
    };

    let nextIndex = safeIndex;
    if (direction === "up") {
      nextIndex = getIndex(currentColumn, currentRow - 1);
    } else if (direction === "down") {
      nextIndex = getIndex(currentColumn, currentRow + 1);
    } else if (direction === "left") {
      if (currentColumn === 0 && page > 0) {
        handlePageChange(page - 1, { row: currentRow, edge: "end" });
        return;
      }
      nextIndex = getIndex(currentColumn - 1, currentRow);
    } else if (direction === "right") {
      if (currentColumn >= totalColumns - 1 && page < totalPages - 1) {
        handlePageChange(page + 1, { row: currentRow, edge: "start" });
        return;
      }
      nextIndex = getIndex(currentColumn + 1, currentRow);
    }

    if (direction === "left" && nextIndex === safeIndex && safeIndex === 0 && page > 0) {
      handlePageChange(page - 1, { row: currentRow, edge: "end" });
      return;
    }

    if (
      direction === "right" &&
      nextIndex === safeIndex &&
      safeIndex === currentPageItems.length - 1 &&
      page < totalPages - 1
    ) {
      handlePageChange(page + 1, { row: currentRow, edge: "start" });
      return;
    }

    const next = currentPageItems[Math.max(0, Math.min(total - 1, nextIndex))];
    if (!next) return;
    setSelectedId(next.id);
    document.getElementById(`history-item-${next.id}`)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
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

  const getPlainTextFromItem = (item: HistoryItem | { content: string; contentType: "text" }) => {
    if (item.contentType === "text") return item.content;
    if (item.contentType === "file") return item.content;
    return null;
  };

  const saveManagedTags = async (nextTags: ManagedTag[]) => {
    const normalized = sanitizeManagedTags(nextTags);
    await api.setConfig({ managedTags: normalized });
    setManagedTags(normalized);
  };

  const writeItemToClipboard = async (
    item: HistoryItem | { id: number; content: string; contentType: "text" },
    options?: { plainText?: boolean },
  ) => {
    if ("isPrivate" in item && item.isPrivate) {
      throw new Error("This item is private. Unlock it before copying.");
    }

    if (options?.plainText) {
      const plainText = getPlainTextFromItem(item);
      if (plainText === null) {
        throw new Error("Plain-text paste is only supported for text and file items.");
      }
      await writeText(plainText);
      setInjectedOverrideSig(plainText);
      return;
    }

    if (item.contentType === "text") {
      await writeText(item.content);
      setInjectedOverrideSig(item.content);
      return;
    }

    if (item.contentType === "image") {
      await writeImageDataUrl(item.content);
      const width = "metadata" in item ? item.metadata.width?.[0] : null;
      const height = "metadata" in item ? item.metadata.height?.[0] : null;
      setInjectedOverrideSig(width && height ? `img_${width}x${height}` : item.content);
      return;
    }

    if (item.contentType === "file") {
      const files = item.content.split("\n").map((path) => path.trim()).filter(Boolean);
      if (files.length === 0) throw new Error("No files to copy.");
      await writeFiles(files);
      setInjectedOverrideSig(`files_${files.join("|")}`);
      return;
    }
  };

  const applyWindowHideForPaste = async () => {
    await getCurrentWindow().hide().catch(() => {});
    window.setTimeout(async () => {
      try {
        await api.simulatePaste();
      } catch (err) {
        setErrorMsg("Paste simulation error: " + String(err));
      }
    }, 90);
  };

  const pasteHistoryItem = async (item: HistoryItem, options?: { plainText?: boolean; hideWindow?: boolean }) => {
    await resetClipboardStack();
    await writeItemToClipboard(item, options);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 1600);
    setSelectedId(item.id);
    void api.markUsed(item.id).catch(console.error);
    if (options?.hideWindow !== false) {
      await applyWindowHideForPaste();
    }
  };

  const handleCopy = async (
    item: HistoryItem | { id: number; content: string; contentType: "text" },
  ) => {
    try {
      const willAutoPaste = autoPaste && !keepWindowOpen && !alwaysOnTop;
      if (willAutoPaste) {
        await resetClipboardStack();
      }
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
      await pasteHistoryItem(item, { hideWindow: !alwaysOnTop });
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

  const toggleQueuedItem = (id: number) => {
    setQueuedIds((prev) => {
      const index = prev.indexOf(id);
      if (index >= 0) return prev.filter((value) => value !== id);
      return [...prev, id];
    });
  };

  const queueOrderFor = (id: number) => {
    const index = queuedIds.indexOf(id);
    return index >= 0 ? index + 1 : null;
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

  const handleToggleTag = async (id: number, tag: string) => {
    const item = sourceHistory.find((i) => i.id === id);
    if (!item) return;
    const nextTags = item.tags.includes(tag)
      ? item.tags.filter((value) => value !== tag)
      : [...item.tags, tag];
    try {
      await api.setTags(id, nextTags);
    } catch (err) {
      setErrorMsg("Tag update error: " + String(err));
    }
  };

  const handleSettingsSaved = (settings: {
    shortcut: string;
    queueStepShortcut: string;
    quickPastePrefix: string;
    stackShortcutPrefix: string;
    wordTranslateShortcut: string;
    itemTagShortcut: string;
    itemPrivateShortcut: string;
    itemPinShortcut: string;
    itemDeleteShortcut: string;
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
    setAutoPaste(settings.autoPaste);
    setKeepWindowOpen(settings.keepWindowOpen);
    setAlwaysOnTop(settings.alwaysOnTop);
    setItemTagShortcut(normalizeLocalShortcut(settings.itemTagShortcut));
    setItemPrivateShortcut(normalizeLocalShortcut(settings.itemPrivateShortcut));
    setItemPinShortcut(normalizeLocalShortcut(settings.itemPinShortcut));
    setItemDeleteShortcut(normalizeLocalShortcut(settings.itemDeleteShortcut));
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

  const currentSelectedItem = () =>
    currentPageItems.find((item) => item.id === selectedId) ?? currentPageItems[0] ?? null;

  const openQuickTagPicker = (item: HistoryItem) => {
    setSelectedId(item.id);
    setQuickTagItemId((current) => (current === item.id ? null : item.id));
  };

  const closeQuickTagPicker = () => {
    setQuickTagItemId(null);
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

  const handleCreateManagedTag = async (tag: string) => {
    const cleaned = tag.trim();
    if (!cleaned) return;
    if (allKnownTags.some((value) => value.name.toLowerCase() === cleaned.toLowerCase())) {
      throw new Error("Tag already exists.");
    }
    if (isReservedFunctionalTagName(cleaned)) {
      throw new Error("This tag is managed automatically.");
    }
    if (sourceHistory.some((item) => item.metadata?.deviceName?.some((name) => name === cleaned))) {
      throw new Error("Device tags are managed automatically.");
    }
    await saveManagedTags([...allKnownTags, { name: cleaned, common: false, color: DEFAULT_TAG_COLOR }]);
  };

  const handleRenameManagedTag = async (from: string, to: string) => {
    const cleaned = to.trim();
    if (!cleaned) return;
    if (
      from.toLowerCase() !== cleaned.toLowerCase() &&
      allKnownTags.some((value) => value.name.toLowerCase() === cleaned.toLowerCase())
    ) {
      throw new Error("Tag already exists.");
    }
    if (isReservedFunctionalTagName(cleaned)) {
      throw new Error("This tag is managed automatically.");
    }

    setTagManageBusy(true);
    try {
      const sourceTag = allKnownTags.find((tag) => tag.name === from);
      if (sourceTag && isDeviceSystemTag(sourceTag)) {
        await api.renameDeviceTag(from, cleaned);
        const nextManagedTags = managedTags.filter((tag) => tag.name.toLowerCase() !== from.toLowerCase());
        nextManagedTags.push({
          id: deviceTagId(cleaned),
          name: cleaned,
          common: sourceTag.common,
          color: sourceTag.color || "#8764b8",
          system: true,
        });
        await saveManagedTags(nextManagedTags);
        await reloadHistory();
        setActiveTags((prev) => prev.map((tag) => (tag === from ? cleaned : tag)));
        setActiveView((prev) => (prev === `tag:${from}` ? (`tag:${cleaned}` as ActiveView) : prev));
        return;
      }
      const affected = sourceHistory.filter((item) => item.tags.includes(from));
      await Promise.all(
        affected.map((item) =>
          api.setTags(
            item.id,
            item.tags.map((tag) => (tag === from ? cleaned : tag)),
          ),
        ),
      );
      await saveManagedTags(
        allKnownTags.map((tag) =>
          tag.name === from ? { ...tag, name: cleaned } : tag,
        ),
      );
      setActiveTags((prev) => prev.map((tag) => (tag === from ? cleaned : tag)));
      setActiveView((prev) => (prev === `tag:${from}` ? (`tag:${cleaned}` as ActiveView) : prev));
    } finally {
      setTagManageBusy(false);
    }
  };

  const handleDeleteManagedTag = async (tag: string) => {
    if (!window.confirm(`Delete tag "${tag}"? This will remove it from all items.`)) {
      return;
    }
    setTagManageBusy(true);
    try {
      const affected = sourceHistory.filter((item) => item.tags.includes(tag));
      await Promise.all(
        affected.map((item) => api.setTags(item.id, item.tags.filter((value) => value !== tag))),
      );
      await saveManagedTags(allKnownTags.filter((value) => value.name !== tag));
      setActiveTags((prev) => prev.filter((value) => value !== tag));
      setActiveView((prev) => (prev === `tag:${tag}` ? "all" : prev));
      setTagSelectorOpen(false);
    } finally {
      setTagManageBusy(false);
    }
  };

  const handleToggleManagedTagCommon = async (tag: string) => {
    setTagManageBusy(true);
    try {
      await saveManagedTags(
        allKnownTags.map((item) =>
          item.name === tag ? { ...item, common: !item.common } : item,
        ),
      );
    } finally {
      setTagManageBusy(false);
    }
  };

  const handleSetManagedTagColor = async (tag: string, color: string) => {
    setTagManageBusy(true);
    try {
      await saveManagedTags(
        allKnownTags.map((item) =>
          item.name === tag ? { ...item, color } : item,
        ),
      );
    } finally {
      setTagManageBusy(false);
    }
  };

  useEffect(() => {
    void api.syncQueueState(queuedIds).catch((err) => {
      console.error("Sync queue state failed:", err);
    });
  }, [queuedIds]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ ids: number[] }>("eacptrans://queue-updated", ({ payload }) => {
      if (!payload || !Array.isArray(payload.ids)) return;
      setQueuedIds(payload.ids);
    }).then((fn) => {
      unlisten = fn;
    }).catch((err) => {
      console.error("Queue update listener failed:", err);
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    const clearBlurTimer = () => {
      if (blurHideTimerRef.current !== null) {
        window.clearTimeout(blurHideTimerRef.current);
        blurHideTimerRef.current = null;
      }
    };
    const scheduleBlurHide = () => {
      clearBlurTimer();
      blurHideTimerRef.current = window.setTimeout(() => {
        if (edgeInteractingRef.current || Date.now() < suppressBlurHideUntilRef.current) {
          return;
        }
        void appWindow.hide().catch(() => {});
      }, 160);
    };
    void appWindow.onFocusChanged(({ payload }) => {
      if (!payload) {
        if (edgeInteractingRef.current || Date.now() < suppressBlurHideUntilRef.current) {
          console.info("[EasyCPTrans] Ignore blur-hide during transient window interaction.");
          return;
        }
        scheduleBlurHide();
      } else {
        clearBlurTimer();
      }
    }).then((fn) => {
      unlisten = fn;
    });
    void appWindow.onResized(() => {
      markTransientWindowInteraction(6500);
      setWindowLayoutTick((value) => value + 1);
    }).then((fn) => {
      unlistenResize = fn;
    });
    void appWindow.onMoved(() => {
      markTransientWindowInteraction(2200);
    }).then((fn) => {
      unlistenMove = fn;
    });
    const handlePointerDown = () => {
      edgeInteractingRef.current = true;
      markTransientWindowInteraction(1800);
    };
    const handleMouseUp = () => {
      edgeInteractingRef.current = false;
      markTransientWindowInteraction(1200);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      clearBlurTimer();
      unlisten?.();
      unlistenResize?.();
      unlistenMove?.();
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (privacyAction) return;
        if (quickTagItemId !== null) {
          closeQuickTagPicker();
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

      if (activeView === "settings" || activeView === "tag-manager" || privacyAction) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      }

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        navigateGridSelection(
          event.key === "ArrowDown"
            ? "down"
            : event.key === "ArrowUp"
              ? "up"
              : event.key === "ArrowLeft"
                ? "left"
                : "right",
        );
        return;
      }

      {
        const shortcut = eventToLocalShortcut(event);
        const selected = currentSelectedItem();
        if (selected && shortcut === normalizeLocalShortcut(itemTagShortcut)) {
          event.preventDefault();
          openQuickTagPicker(selected);
          return;
        }
        if (selected && shortcut === normalizeLocalShortcut(itemPrivateShortcut)) {
          event.preventDefault();
          if (selected.isPrivate) handleDisablePrivacy(selected.id);
          else handleEnablePrivacy(selected.id);
          return;
        }
        if (selected && shortcut === normalizeLocalShortcut(itemPinShortcut)) {
          event.preventDefault();
          handleTogglePin(selected.id);
          return;
        }
        if (selected && shortcut === normalizeLocalShortcut(itemDeleteShortcut)) {
          event.preventDefault();
          if (quickTagItemId === selected.id) closeQuickTagPicker();
          handleDelete(selected.id);
          return;
        }
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (currentPageItems.length === 0) return;
        const selected =
          currentPageItems.find((item) => item.id === selectedId) ?? currentPageItems[0];
        setSelectedId(selected.id);
        handleCopyFromUI(selected);
        return;
      }

      if (event.key === " " || event.key === "Tab") {
        event.preventDefault();
        const selected =
          currentPageItems.find((item) => item.id === selectedId) ?? currentPageItems[0];
        if (!selected) return;
        toggleQueuedItem(selected.id);
        if (event.key === "Tab") {
          const currentIndex = currentPageItems.findIndex((item) => item.id === selected.id);
          const nextIndex = Math.min(currentPageItems.length - 1, Math.max(0, currentIndex + 1));
          setSelectedId(currentPageItems[nextIndex].id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, currentPageItems, privacyAction, quickTagItemId, searchOpen, selectedId, queuedIds, sourceHistory, cardRows, page, totalPages, alwaysOnTop, itemTagShortcut, itemPrivateShortcut, itemPinShortcut, itemDeleteShortcut]);

  const onTabClick = (key: ActiveView) => {
    if (key === "settings" && activeView === "settings") {
      if (settingsSaveState === "saving") return;
      const saveTask = settingsModalRef.current?.save();
      if (!saveTask) return;
      setSettingsSaveState("saving");
      void saveTask
        .then(() => {
          setSettingsSaveState("saved");
          window.setTimeout(() => setSettingsSaveState("idle"), 1200);
        })
        .catch((err) => {
          setSettingsSaveState("error");
          setErrorMsg("Save settings failed: " + String(err));
          window.setTimeout(() => setSettingsSaveState("idle"), 1600);
        });
      return;
    }
    if (key === "tag-selector") {
      if (tagSelectorOpen) {
        setTagSelectorOpen(false);
        setActiveTags([]);
        setActiveView("all");
      } else {
        setTagSelectorOpen(true);
        setActiveView("tag-selector");
        setScope("all");
      }
      return;
    }

    setTagSelectorOpen(false);
    setActiveView(key);
    if (key === "settings" || key === "tag-manager") {
      setScope("all");
      return;
    }
    if (key.startsWith("tag:")) {
      const tag = key.slice(4);
      setScope("all");
      setActiveTags(tag ? [tag] : []);
      return;
    }
    setActiveTags([]);
    setScope(key as Scope);
  };

  return (
    <div className="eacptrans-shell" ref={shellRef}>
      <div
        className="eacptrans-drag-edge eacptrans-drag-edge-top"
        data-tauri-drag-region
        onMouseDown={() => {
          edgeInteractingRef.current = true;
          markTransientWindowInteraction(5000);
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      <div
        className="eacptrans-drag-edge eacptrans-drag-edge-left"
        data-tauri-drag-region
        onMouseDown={() => {
          edgeInteractingRef.current = true;
          markTransientWindowInteraction(5000);
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      <div
        className="eacptrans-drag-edge eacptrans-drag-edge-right"
        data-tauri-drag-region
        onMouseDown={() => {
          edgeInteractingRef.current = true;
          markTransientWindowInteraction(5000);
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />

      <section className="eacptrans-toolbar">
          <button
            className="eacptrans-icon-btn eacptrans-drag-handle-btn"
            title="Drag window"
            onMouseDown={(event) => {
              event.preventDefault();
              edgeInteractingRef.current = true;
              markTransientWindowInteraction(5000);
              void getCurrentWindow().startDragging().catch(() => {});
            }}
          >
            <GripHorizontal className="h-4 w-4" />
          </button>

          <button
            className={`eacptrans-icon-btn ${alwaysOnTop ? "active" : ""}`}
            title={alwaysOnTop ? "Unpin window" : "Pin window on top"}
            onClick={() => {
              const next = !alwaysOnTop;
              setAlwaysOnTop(next);
              void api.setConfig({ alwaysOnTop: next }).catch(console.error);
            }}
          >
            <Pin className="h-4 w-4" />
          </button>

          <div className="eacptrans-search-wrap">
            <button
              className="eacptrans-search-btn"
              title="Search (supports tag/app/type/date/size syntax)"
              onClick={() => {
                const next = !searchOpen;
                setSearchOpen(next);
                if (!next) setSearch("");
              }}
            >
              <Search className="h-4 w-4" />
            </button>
            <div className={`eacptrans-search-expand ${searchOpen ? "open" : ""}`}>
              <input
                autoFocus={searchOpen}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Search... tag:work app:chrome type:text "exact phrase"'
              />
            </div>
          </div>

          <button className="eacptrans-scroll-arrow" onClick={() => handleScrollTabs("left")}>
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="eacptrans-filter-scroll" id="filter-scroll">
            {tabList.map(({ key, label, dotClass, icon: Icon }) => {
              const active = key === "tag-selector" ? tagSelectorOpen : activeView === key;
              const TabIcon =
                key === "settings" && settingsSaveState === "saving"
                  ? RefreshCw
                  : key === "settings" && settingsSaveState === "saved"
                    ? CheckSquare
                    : Icon;
              const systemConfig = SYSTEM_TAGS.find((tag) => tag.key === key)
                ? allKnownTags.find((tag) => tag.id === SYSTEM_TAGS.find((entry) => entry.key === key)?.id)
                : null;
              return (
                <Fragment key={key}>
                  <button
                    className={`eacptrans-filter-tab ${active ? "active" : ""}`}
                    style={
                      key.startsWith("tag:") || systemConfig
                        ? ({
                            borderColor: active ? `${systemConfig?.color ?? allKnownTags.find((tag) => `tag:${tag.name}` === key)?.color ?? DEFAULT_TAG_COLOR}55` : undefined,
                            background: active ? `${systemConfig?.color ?? allKnownTags.find((tag) => `tag:${tag.name}` === key)?.color ?? DEFAULT_TAG_COLOR}14` : undefined,
                            color: active ? systemConfig?.color ?? allKnownTags.find((tag) => `tag:${tag.name}` === key)?.color ?? undefined : undefined,
                          } as object)
                        : undefined
                    }
                    onClick={() => onTabClick(key)}
                  >
                    <span
                      className={`eacptrans-tab-dot ${dotClass}`}
                      style={
                        key.startsWith("tag:") || systemConfig
                          ? ({ background: systemConfig?.color ?? allKnownTags.find((tag) => `tag:${tag.name}` === key)?.color ?? DEFAULT_TAG_COLOR } as object)
                          : undefined
                      }
                    />
                    <span>{label}</span>
                    <TabIcon className={`h-3.5 w-3.5 ${key === "settings" && settingsSaveState === "saving" ? "animate-spin" : ""}`} />
                  </button>
                  {key === "tag-selector" && tagSelectorOpen && (
                    <div className="eacptrans-tag-inline-list">
                      {selectableTags.length === 0 ? (
                        <span className="eacptrans-tag-inline-empty">No tags</span>
                      ) : (
                        selectableTags.map((tag) => {
                          const tagActive = activeTags.includes(tag.name);
                          return (
                            <button
                              key={tag.name}
                              className={`eacptrans-tag-inline-chip ${tagActive ? "active" : ""}`}
                              style={{
                                borderColor: tagActive ? `${tag.color}66` : undefined,
                                background: tagActive ? `${tag.color}14` : undefined,
                                color: tagActive ? tag.color : undefined,
                              }}
                              onClick={() => toggleTag(tag.name)}
                            >
                              {tagActive ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                              <span>#{tag.name}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>

          <button className="eacptrans-scroll-arrow" onClick={() => handleScrollTabs("right")}>
            <ChevronRight className="h-4 w-4" />
          </button>
      </section>

      <ErrorBanner message={errorMsg} />

      <main
        className={`eacptrans-main ${
          activeView === "settings" || activeView === "tag-manager"
            ? "eacptrans-main-settings"
            : "eacptrans-main-cards"
        }`}
      >
        {activeView === "settings" ? (
          <SettingsModal ref={settingsModalRef} onSaved={handleSettingsSaved} />
        ) : activeView === "tag-manager" ? (
          <TagManagementPage
            tags={allKnownTags}
            tagCounts={tagCountMap}
            busy={tagManageBusy}
            onCreate={handleCreateManagedTag}
            onRename={handleRenameManagedTag}
            onDelete={handleDeleteManagedTag}
            onToggleCommon={handleToggleManagedTagCommon}
            onSetColor={handleSetManagedTagColor}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            filtered={hasFilters && sourceHistory.length > 0}
            onClear={hasFilters ? clearFilters : undefined}
          />
        ) : (
          <div
            ref={cardStripRef}
            className="eacptrans-card-strip"
            id="card-scroll"
            style={{ ["--card-rows" as string]: String(cardRows) }}
          >
            {page > 0 && (
              <button className="eacptrans-page-card" onClick={() => handlePageChange(page - 1)}>
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
                  availableTags={selectableTags.map((tag) => tag.name)}
                  tagColors={tagColorMap}
                  isSelected={selectedId === item.id}
                  isCopied={copiedId === item.id}
                  quickSlot={
                    page === 0 && currentPageItems.indexOf(item) < 10
                      ? currentPageItems.indexOf(item) + 1
                      : null
                  }
                  queueSlot={queueOrderFor(item.id)}
                  onCopy={handleCopyFromUI}
                  onPaste={handlePaste}
                  onTogglePin={handleTogglePin}
                  onDelete={handleDelete}
                  onToggleTag={handleToggleTag}
                  onEnablePrivacy={handleEnablePrivacy}
                  onDisablePrivacy={handleDisablePrivacy}
                  onQuickEdit={handleQuickEdit}
                  tagMenuOpen={quickTagItemId === item.id}
                  onTagMenuClose={closeQuickTagPicker}
                />
              ))}
            {page < totalPages - 1 && (
              <button className="eacptrans-page-card" onClick={() => handlePageChange(page + 1)}>
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

async function writeImageDataUrl(dataUrl: string): Promise<void> {
  const imagePath = await api.saveTempImage(dataUrl);
  await writeImage(imagePath);
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
