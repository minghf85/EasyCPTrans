import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
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

import { ClipboardCard, type CardActions } from "./components/ClipboardCard";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { ImageLightbox } from "./components/ImageLightbox";
import { MemoryChip } from "./components/MemoryChip";
import { OcrResultModal } from "./components/OcrResultModal";
import { PasswordPromptModal } from "./components/PasswordPromptModal";
import { CardContextMenu } from "./components/CardContextMenu";
import { MatchPanel, MATCH_DRAG_MIME, writeMatchDragData } from "./components/RegexMatchStack";
import { QuickTextEditorPage } from "./components/QuickTextEditorPage";
import { SettingsModal } from "./components/SettingsModal";
import type { SettingsModalHandle } from "./components/SettingsModal";
import { TagManagementPage } from "./components/TagManagementPage";
import { WelcomeGuide } from "./components/WelcomeGuide";
import {
  focusRing,
  iconButton,
  iconButtonActive,
  input,
  navBar,
  surface,
  surfaceInteractive,
  transition,
} from "./components/ui";
import { resetClipboardStack, useClipboardWatcher, setInjectedOverrideSig } from "./hooks/useClipboardWatcher";
import { useHistory } from "./hooks/useHistory";
import { api } from "./lib/api";
import { fetchImageDataUrl } from "./lib/imageCache";
import { normalizeLocale, tr, type Locale } from "./lib/i18n";
import { ensureStagedDropPath, stagedDropPath } from "./lib/dropStage";
import { quickSlotIndex } from "./lib/cardInteraction";
import { shouldHideOnBlur } from "./lib/windowFocus";
import { escapeTarget, isEditingField, shouldHandleCardShortcut } from "./lib/interactionRules";
import type { DragChipBitmap } from "./lib/dragChip";
import type { TagMatchGroup } from "./lib/tagMatches";
import { getLocalizedReservedNames, getTagDisplayName } from "./lib/tagDisplay";
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
const DEFAULT_ITEM_OCR_SHORTCUT = "O";
/** Enlarges the selected image. Only images respond to it. */
const DEFAULT_ITEM_ZOOM_SHORTCUT = "Z";
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

type ActiveView = Scope | "tag-selector" | "tag-manager" | "settings" | `tag:${string}`;

function deviceTagId(name: string) {
  return `sys-device-${name.trim().toLowerCase()}`;
}

function isReservedFunctionalTagName(name: string) {
  return ["text", "image", "file", "word", "private", "privacy", "pinned", "ocr", "link", "email", "phone", "path", "ip", "color"].includes(
    name.trim().toLowerCase(),
  );
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

    // Rule fields are carried through, trimmed: this builder runs on every tag
    // save, so dropping them here would wipe every regex rule on an unrelated
    // color or pin change.
    const pattern = tag.pattern?.trim() || null;
    let next: ManagedTag = {
      id: tag.id,
      name: trimmedName,
      common: Boolean(tag.common),
      color: tag.color?.trim() || DEFAULT_TAG_COLOR,
      system: Boolean(tag.system),
      pattern,
      ignoreCase: Boolean(pattern) && Boolean(tag.ignoreCase),
      extract: Boolean(pattern) && Boolean(tag.extract),
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
  const pendingSelectionRef = useRef<{ page: number; at: "first" | "last" } | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  // Read inside the blur timer, which outlives the render that scheduled it.
  const alwaysOnTopRef = useRef(alwaysOnTop);
  alwaysOnTopRef.current = alwaysOnTop;
  /** Whether the initial config read has finished; see the always-on-top effect. */
  const [configReady, setConfigReady] = useState(false);
  const [itemTagShortcut, setItemTagShortcut] = useState(DEFAULT_ITEM_TAG_SHORTCUT);
  const [itemPrivateShortcut, setItemPrivateShortcut] = useState(DEFAULT_ITEM_PRIVATE_SHORTCUT);
  const [itemPinShortcut, setItemPinShortcut] = useState(DEFAULT_ITEM_PIN_SHORTCUT);
  const [itemDeleteShortcut, setItemDeleteShortcut] = useState(DEFAULT_ITEM_DELETE_SHORTCUT);
  const [itemOcrShortcut, setItemOcrShortcut] = useState(DEFAULT_ITEM_OCR_SHORTCUT);
  const [itemZoomShortcut, setItemZoomShortcut] = useState(DEFAULT_ITEM_ZOOM_SHORTCUT);
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [pageSize, setPageSize] = useState(50);
  const [historyLimit, setHistoryLimit] = useState(5000);
  const [ocrPanel, setOcrPanel] = useState<{ item: HistoryItem; text: string } | null>(null);
  const [ocrBusyId, setOcrBusyId] = useState<number | null>(null);
  const ocrBusyIdRef = useRef<number | null>(null);
  const [apiTranslateEnabled, setApiTranslateEnabled] = useState(false);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [showMemoryUsage, setShowMemoryUsage] = useState(false);
  const [managedTags, setManagedTags] = useState<ManagedTag[]>([]);
  const [tagManageBusy, setTagManageBusy] = useState(false);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [cardMenu, setCardMenu] = useState<{ itemId: number; x: number; y: number } | null>(null);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [queuedIds, setQueuedIds] = useState<number[]>([]);
  const [lightbox, setLightbox] = useState<{ item: HistoryItem; src: string } | null>(null);
  const [matchPanel, setMatchPanel] = useState<{ item: HistoryItem; group: TagMatchGroup } | null>(null);
  // True while a match row is in flight, so the strip only lights up for that
  // drag and not for unrelated ones (file drops from other apps, text selections).
  const [matchDragging, setMatchDragging] = useState(false);
  const [stripDropActive, setStripDropActive] = useState(false);
  const [privacyAction, setPrivacyAction] = useState<{ id: number } | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [sessionPrivacyPassword, setSessionPrivacyPassword] = useState<string | null>(null);
  const settingsModalRef = useRef<SettingsModalHandle | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem("eacp-welcome-seen");
  });

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
        const nextItemOcrShortcut = normalizeShortcutValue(cfg.itemOcrShortcut, DEFAULT_ITEM_OCR_SHORTCUT);
        const nextItemZoomShortcut = normalizeShortcutValue(cfg.itemZoomShortcut, DEFAULT_ITEM_ZOOM_SHORTCUT);
        setLocale(normalizeLocale(cfg.locale));
        if (
          nextShortcut !== (cfg.shortcut ?? "") ||
          nextQueueStepShortcut !== (cfg.queueStepShortcut ?? "") ||
          nextQuickPastePrefix !== (cfg.quickPastePrefix ?? "") ||
          nextStackShortcutPrefix !== (cfg.stackShortcutPrefix ?? "") ||
          nextWordTranslateShortcut !== (cfg.wordTranslateShortcut ?? "") ||
          nextItemTagShortcut !== (cfg.itemTagShortcut ?? "") ||
          nextItemPrivateShortcut !== (cfg.itemPrivateShortcut ?? "") ||
          nextItemPinShortcut !== (cfg.itemPinShortcut ?? "") ||
          nextItemDeleteShortcut !== (cfg.itemDeleteShortcut ?? "") ||
          nextItemOcrShortcut !== (cfg.itemOcrShortcut ?? "") ||
          nextItemZoomShortcut !== (cfg.itemZoomShortcut ?? "")
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
            itemOcrShortcut: nextItemOcrShortcut,
            itemZoomShortcut: nextItemZoomShortcut,
          }).catch(console.error);
        }
        setItemTagShortcut(normalizeLocalShortcut(nextItemTagShortcut));
        setItemPrivateShortcut(normalizeLocalShortcut(nextItemPrivateShortcut));
        setItemPinShortcut(normalizeLocalShortcut(nextItemPinShortcut));
        setItemDeleteShortcut(normalizeLocalShortcut(nextItemDeleteShortcut));
        setItemOcrShortcut(normalizeLocalShortcut(nextItemOcrShortcut));
        setItemZoomShortcut(normalizeLocalShortcut(nextItemZoomShortcut));
        if (typeof cfg.autoPaste === "boolean") setAutoPaste(cfg.autoPaste);
        if (typeof cfg.keepWindowOpen === "boolean") setKeepWindowOpen(cfg.keepWindowOpen);
        if (typeof cfg.alwaysOnTop === "boolean") setAlwaysOnTop(cfg.alwaysOnTop);
        if (typeof cfg.pageSize === "number") setPageSize(cfg.pageSize);
        if (typeof cfg.historyLimit === "number") setHistoryLimit(cfg.historyLimit);
        setApiTranslateEnabled(Boolean(cfg.apiTranslateEnabled));
        setOcrEnabled(cfg.ocrEnabled !== false);
        setShowMemoryUsage(Boolean(cfg.showMemoryUsage));
        if (Array.isArray(cfg.managedTags)) {
          const sanitized = sanitizeManagedTags(cfg.managedTags);
          setManagedTags(sanitized);
          if (JSON.stringify(sanitized) !== JSON.stringify(cfg.managedTags)) {
            void api.setConfig({ managedTags: sanitized }).catch(console.error);
          }
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setConfigReady(true));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = window.setTimeout(() => setErrorMsg(null), 4000);
    return () => window.clearTimeout(timer);
  }, [errorMsg]);

  useEffect(() => {
    // The window is created with the saved value already applied, so pushing the
    // front-end's initial `false` here would briefly undo a pin set before the
    // last exit — and undo it for good if the config read failed.
    if (!configReady) return;
    const appWindow = getCurrentWindow();
    appWindow
      .setAlwaysOnTop(alwaysOnTop)
      // A failed read-back must not be reported as a failed write, so it falls
      // back to the value that was just applied.
      .then(() => appWindow.isAlwaysOnTop().catch(() => alwaysOnTop))
      .then((actual) => {
        // The button reports the window, not the intent: if the two disagree,
        // the window wins so the pin never claims a state it does not have.
        if (actual !== alwaysOnTop) setAlwaysOnTop(actual);
      })
      .catch((err) => {
        setErrorMsg("Set always-on-top failed: " + String(err));
      });
  }, [alwaysOnTop, configReady]);

  useEffect(() => {
    // One authoritative read once the config has landed, which is what recovers
    // the state when the config read itself failed.
    if (!configReady) return;
    void getCurrentWindow()
      .isAlwaysOnTop()
      .then((actual) => setAlwaysOnTop(actual))
      .catch(() => {});
  }, [configReady]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, scope, activeTags, advancedFilters, activeView]);

  const { history, reload: reloadHistory } = useHistory(historyLimit, setErrorMsg);
  useClipboardWatcher(0, setErrorMsg);
  const sourceHistory = history;
  const filterState = { search: debouncedSearch, scope, activeTags, ...advancedFilters };
  const filtered = useMemo(
    () => applyFilters(sourceHistory, filterState as FilterState),
    [sourceHistory, debouncedSearch, scope, activeTags, advancedFilters],
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
            label:
              systemTag.key === "text"
                ? tr(locale, "text")
                : systemTag.key === "image"
                  ? tr(locale, "image")
                  : systemTag.key === "file"
                    ? tr(locale, "file")
                    : systemTag.key === "pinned"
                      ? tr(locale, "pinned")
                      : current.name,
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
        label: `#${getTagDisplayName(tag.name, locale)}`,
        dotClass: "dot-tag",
        icon: Tags,
      }));
    const customCommonTabs = allKnownTags
      .filter((tag) => tag.common && !tag.system)
      .map((tag) => ({
        key: `tag:${tag.name}` as const,
        label: `#${getTagDisplayName(tag.name, locale)}`,
        dotClass: "dot-tag",
        icon: Tags,
      }));
    const baseTabs: Array<{
      key: Scope;
      label: string;
      dotClass: string;
      icon: typeof FileText;
    }> = [{ key: "all", label: tr(locale, "all"), dotClass: "dot-all", icon: FileText }];
    return [
      ...baseTabs,
      ...systemTabs,
      ...deviceTabs,
      ...functionalTabs,
      ...customCommonTabs,
      { key: "tag-selector" as const, label: tr(locale, "tags"), dotClass: "dot-tag", icon: Tags },
      { key: "tag-manager" as const, label: tr(locale, "tagAdmin"), dotClass: "dot-tag", icon: Tags },
      { key: "settings" as const, label: tr(locale, "settings"), dotClass: "dot-settings", icon: Settings2 },
    ];
  }, [allKnownTags, sourceHistory, locale]);
  const selectableTags = useMemo(
    () =>
      [...allKnownTags].sort(
        (a, b) =>
          Number(Boolean(b.system)) - Number(Boolean(a.system)) ||
          Number(Boolean(b.common)) - Number(Boolean(a.common)) ||
          (tagCountMap.get(b.name) ?? 0) - (tagCountMap.get(a.name) ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [allKnownTags, tagCountMap],
  );
  const assignableTags = useMemo(
    () => allKnownTags.filter((tag) => !tag.system),
    [allKnownTags],
  );
  const assignableTagNames = useMemo(
    () => assignableTags.map((tag) => tag.name),
    [assignableTags],
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
        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
        if (delta === 0) return;

        // A nested scroller that can still consume this wheel keeps the event;
        // the strip only takes over once the innermost scroller is at its end.
        // Card bodies, menus and match lists all opt in via `.eacp-scroll`.
        const nested = target?.closest(".eacp-scroll, .eacp-scroll-none") as HTMLElement | null;
        if (nested && nested !== node) {
          if (nested.scrollHeight > nested.clientHeight) return;
          if (nested.scrollWidth > nested.clientWidth) return;
        }

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
      const total = currentPageItems.length;
      const targetIndex = pending.at === "first" ? 0 : total - 1;
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
  }, [activeView, currentPageItems, selectedId, page]);

  useEffect(() => {
    const ids = new Set(sourceHistory.map((item) => item.id));
    setQueuedIds((prev) => prev.filter((id) => ids.has(id)));
  }, [sourceHistory]);

  const handleScrollTabs = (direction: "left" | "right") => {
    const node = document.getElementById("filter-scroll");
    if (!node) return;
    node.scrollBy({ left: direction === "left" ? -140 : 140, behavior: "smooth" });
  };

  const handlePageChange = (nextPage: number, pendingSelection?: { at: "first" | "last" }) => {
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

  const navigateGridSelectionRef = useRef<(direction: "left" | "right" | "up" | "down") => void>(() => {});
  /**
   * The strip is a single row of cards, so every direction moves one card along
   * it: left/up step back, right/down step forward, crossing page boundaries at
   * either end.
   */
  const navigateGridSelection = (direction: "left" | "right" | "up" | "down") => {
    if (currentPageItems.length === 0) return;

    const currentIndex = currentPageItems.findIndex((item) => item.id === selectedId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const total = currentPageItems.length;
    const back = direction === "left" || direction === "up";

    if (back && safeIndex === 0) {
      if (page > 0) handlePageChange(page - 1, { at: "last" });
      return;
    }
    if (!back && safeIndex === total - 1) {
      if (page < totalPages - 1) handlePageChange(page + 1, { at: "first" });
      return;
    }

    const next = currentPageItems[Math.max(0, Math.min(total - 1, safeIndex + (back ? -1 : 1)))];
    if (!next) return;
    setSelectedId(next.id);
    document.getElementById(`history-item-${next.id}`)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  };
  navigateGridSelectionRef.current = navigateGridSelection;

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      return [...prev, tag];
    });
  };

  const clearFilters = () => {
    const f = emptyFilter();
    setSearch(f.search);
    setDebouncedSearch(f.search);
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
      const dataUrl =
        item.content || (await fetchImageDataUrl(item.id, api.getImageContent));
      await writeImageDataUrl(dataUrl, item.id);
      const width = "metadata" in item ? item.metadata.width?.[0] : null;
      const height = "metadata" in item ? item.metadata.height?.[0] : null;
      setInjectedOverrideSig(width && height ? `img_${width}x${height}` : dataUrl);
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

  /**
   * Hands the clipboard contents to the application the panel was opened from.
   *
   * A pinned panel stays on screen, so it cannot use hiding to give focus back;
   * the backend moves focus to the remembered window instead. Either way the
   * keystroke is only sent once the panel is out of the foreground, and the
   * result says whether that actually happened — the old code hid the window and
   * slept for a fixed 90ms, which silently pasted into the wrong place whenever
   * the handover took longer than that.
   */
  const pasteIntoFocusedWindow = async (options?: { keepPanelVisible?: boolean }) => {
    const outcome = await api.pasteToPreviousWindow(!options?.keepPanelVisible);
    if (!outcome.focusMoved) {
      setErrorMsg(tr(locale, "pasteNoTarget"));
    }
  };

  const pasteHistoryItem = async (
    item: HistoryItem,
    options?: { plainText?: boolean; keepPanelVisible?: boolean },
  ) => {
    await resetClipboardStack();
    await writeItemToClipboard(item, options);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 1600);
    setSelectedId(item.id);
    void api.markUsed(item.id).catch(console.error);
    await pasteIntoFocusedWindow({ keepPanelVisible: options?.keepPanelVisible });
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

      // Copy only: get out of the way, unless the panel is pinned or the user
      // asked for it to stay.
      if (!keepWindowOpen && !autoPaste && !alwaysOnTop) {
        await getCurrentWindow().hide();
      }

      // Copy and paste in one gesture. A pinned panel stays put and gets its
      // focus restored instead of being hidden.
      if (autoPaste && !keepWindowOpen) {
        await pasteIntoFocusedWindow({ keepPanelVisible: alwaysOnTop });
      }
    } catch (err) {
      setErrorMsg("Copy error: " + String(err));
    }
  };

  const handlePaste = async (item: HistoryItem) => {
    try {
      await pasteHistoryItem(item, { keepPanelVisible: alwaysOnTop });
    } catch (err) {
      setErrorMsg("Paste error: " + String(err));
    }
  };

  const handleOpenImage = (item: HistoryItem, src: string) => {
    setLightbox({ item, src });
  };

  /**
   * Enlarges the selected image from the keyboard.
   *
   * The card used to carry a hover button for this; the key replaced it, so this
   * is now the only way in and it has to fetch the pixels for an image that has
   * not been scrolled into view yet.
   */
  const handleZoomSelected = async (item: HistoryItem) => {
    if (item.contentType !== "image" || item.isPrivate) return;
    try {
      const src = item.content || (await api.getImageContent(item.id));
      if (!src) throw new Error("Image content unavailable");
      setLightbox({ item, src });
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  /**
   * Hands a card to the native Windows drag loop so it can be dropped into any
   * other application. The call blocks in Rust until the drop resolves, so the
   * panel is told not to hide itself on blur for the duration.
   *
   * `preview` travels along so OLE draws the card's own chip under the cursor
   * instead of its generic feedback.
   */
  const handleCardDragOut = async (item: HistoryItem, _preview: DragChipBitmap | null) => {
    if (item.isPrivate) {
      setErrorMsg(tr(locale, "dragOutPrivate"));
      return;
    }

    // Only files and images support native drag-out. Text drags through OLE's
    // DoDragDrop modal loop, which conflicts with the Tauri webview and causes
    // hangs or silent failures — so text cards simply cannot be dragged.
    if (item.contentType !== "file" && item.contentType !== "image") {
      setErrorMsg(tr(locale, "dragOutTextUnsupported"));
      return;
    }

    let outcome = "none";
    markTransientWindowInteraction(20000);
    try {
      if (item.contentType === "file") {
        const paths = item.content
          .split("\n")
          .map((path) => path.trim())
          .filter(Boolean);
        if (paths.length === 0) throw new Error("No file paths on this item");
        const dropped = await api.nativeDragFile(paths);
        outcome = dropped ? "copy" : "cancelled";
      } else {
        const path = stagedDropPath(item) ?? (await ensureStagedDropPath(item));
        const dropped = await api.nativeDragFile([path]);
        outcome = dropped ? "copy" : "cancelled";
      }
    } catch (err) {
      setErrorMsg(tr(locale, "dragOutFailed") + String(err));
    } finally {
      markTransientWindowInteraction(400);
    }

    if (outcome === "none") {
      setErrorMsg(tr(locale, "dragOutNoTarget"));
    }
  };

  const handleMatchDragStart = (value: string, event: ReactDragEvent) => {
    writeMatchDragData(value, event);
    setMatchDragging(true);
  };

  const handleMatchDragEnd = () => {
    setMatchDragging(false);
    setStripDropActive(false);
  };

  /** Materializes a value — a dragged match, or a click in the overflow panel — as its own card. */
  const handleCreateCardFromText = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    try {
      const id = await api.createStackTextItem(text);
      setMatchPanel(null);
      setSelectedId(id);
      await reloadHistory();
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleStripDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!matchDragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!stripDropActive) setStripDropActive(true);
  };

  // A drag that ends outside the window — or in another application — never
  // fires `dragend`, which used to leave the strip lit up for every later drag.
  useEffect(() => {
    if (!matchDragging) return;
    const clear = () => {
      setMatchDragging(false);
      setStripDropActive(false);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    window.addEventListener("blur", clear);
    const timer = window.setTimeout(clear, 30_000);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
      window.removeEventListener("blur", clear);
      window.clearTimeout(timer);
    };
  }, [matchDragging]);

  const handleStripDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setStripDropActive(false);
  };

  const handleStripDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const dragging = matchDragging;
    setStripDropActive(false);
    setMatchDragging(false);
    if (!dragging) return;

    const value =
      event.dataTransfer.getData(MATCH_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain");
    if (!value.trim()) return;

    event.preventDefault();
    void handleCreateCardFromText(value);
  };

  const handleCopyFromUI = (
    item: HistoryItem | { id: number; content: string; contentType: "text" },
  ) => {
    if ("id" in item && item.id > 0) setSelectedId(item.id);
    void handleCopy(item);
  };

  const runOcrForItem = async (item: HistoryItem) => {
    if (ocrBusyIdRef.current === item.id) return;
    ocrBusyIdRef.current = item.id;
    setOcrBusyId(item.id);
    try {
      const text = await api.ocrImageItem(item.id);
      setOcrPanel({ item, text });
    } catch (err) {
      setErrorMsg(`${tr(locale, "ocrFailed")}${String(err)}`);
      void reloadHistory();
    } finally {
      ocrBusyIdRef.current = null;
      setOcrBusyId(null);
    }
  };

  const handleOcrOpen = (item: HistoryItem) => {
    const existing = item.metadata?.ocrText?.[0];
    if (existing) {
      setOcrPanel({ item, text: existing });
      return;
    }
    void runOcrForItem(item);
  };

  const handleOcrCopyText = (item: HistoryItem, text: string) => {
    setOcrPanel(null);
    void handleCopy({ id: item.id, content: text, contentType: "text" });
  };

  const handleOcrPasteText = async (item: HistoryItem, text: string) => {
    try {
      setOcrPanel(null);
      await resetClipboardStack();
      await writeText(text);
      setInjectedOverrideSig(text);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1600);
      void api.markUsed(item.id).catch(console.error);
      await pasteIntoFocusedWindow({ keepPanelVisible: alwaysOnTop });
    } catch (err) {
      setErrorMsg("Paste error: " + String(err));
    }
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

  const handleCreateAndAttachTag = async (id: number, tag: string) => {
    const cleaned = tag.trim();
    if (!cleaned) return;
    await handleCreateManagedTag(cleaned);
    const item = sourceHistory.find((entry) => entry.id === id);
    if (!item) return;
    const exists = item.tags.some((value) => value.toLowerCase() === cleaned.toLowerCase());
    if (!exists) {
      await api.setTags(id, [...item.tags, cleaned]);
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
    itemOcrShortcut: string;
    itemZoomShortcut: string;
    autoPaste: boolean;
    pageSize: number;
    historyLimit: number;
    webdavUrl: string;
    webdavUsername: string;
    webdavSyncEnabled: boolean;
    deviceName: string;
    apiTranslateEnabled: boolean;
    apiTranslateBaseUrl: string;
    apiTranslateKey: string;
    apiTranslateModel: string;
    apiTranslateTargetLang: string;
    ocrEnabled: boolean;
    showMemoryUsage: boolean;
    locale: Locale;
  }) => {
    setLocale(settings.locale);
    setAutoPaste(settings.autoPaste);
    // `alwaysOnTop` and `keepWindowOpen` are not taken from the settings payload:
    // the modal used to echo back the value it read on mount, which silently
    // undid a pin toggled while the settings page was open.
    setItemTagShortcut(normalizeLocalShortcut(settings.itemTagShortcut));
    setItemPrivateShortcut(normalizeLocalShortcut(settings.itemPrivateShortcut));
    setItemPinShortcut(normalizeLocalShortcut(settings.itemPinShortcut));
    setItemDeleteShortcut(normalizeLocalShortcut(settings.itemDeleteShortcut));
    setItemOcrShortcut(normalizeLocalShortcut(settings.itemOcrShortcut));
    setItemZoomShortcut(normalizeLocalShortcut(settings.itemZoomShortcut));
    setPageSize(settings.pageSize);
    setHistoryLimit(settings.historyLimit);
    setShowMemoryUsage(settings.showMemoryUsage);
    setApiTranslateEnabled(settings.apiTranslateEnabled);
    setOcrEnabled(settings.ocrEnabled);
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

  /**
   * The one open actions menu.
   *
   * A single slot rather than per-card state: the menu used to be owned by the
   * card that opened it, which meant two cards could be open at once, a closed
   * one could clear another card's state, and paging away left the request
   * behind so the menu reappeared on the way back.
   */
  /** The menu only exists while its item is on screen, which is what closes it. */
  const menuItem = useMemo(
    () => (cardMenu ? currentPageItems.find((entry) => entry.id === cardMenu.itemId) ?? null : null),
    [cardMenu, currentPageItems],
  );

  useEffect(() => {
    if (cardMenu && !menuItem) setCardMenu(null);
  }, [cardMenu, menuItem]);

  // Anything modal, or a different page of the app, takes precedence over the menu.
  useEffect(() => {
    if (privacyAction || ocrPanel || lightbox || matchPanel) setCardMenu(null);
  }, [privacyAction, ocrPanel, lightbox, matchPanel]);

  useEffect(() => {
    if (activeView === "settings" || activeView === "tag-manager") setCardMenu(null);
  }, [activeView]);

  const closeCardMenu = useCallback(() => setCardMenu(null), []);

  const openCardMenu = useCallback((item: HistoryItem, anchor: { x: number; y: number }) => {
    // Right-clicking selects, so the menu and the selection never disagree.
    setSelectedId(item.id);
    setCardMenu({ itemId: item.id, x: anchor.x, y: anchor.y });
  }, []);

  /** The keyboard route in, for when the chevron is not there to be clicked. */
  const openCardMenuForSelected = useCallback(
    (item: HistoryItem) => {
      const rect = document.getElementById(`history-item-${item.id}`)?.getBoundingClientRect();
      openCardMenu(item, {
        x: rect ? rect.left + 24 : window.innerWidth / 2,
        y: rect ? rect.top + 48 : window.innerHeight / 2,
      });
    },
    [openCardMenu],
  );

  // The webview's own menu is suppressed by the card itself (its React handler
  // runs first), so text fields and the quick-edit page keep the native copy/paste
  // menu they have always had.
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-card-id]")) return;
      closeCardMenu();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [closeCardMenu]);

  /**
   * The card's action surface, behind a stable identity.
   *
   * `ClipboardCard` is memoised, so passing the handlers as individual props
   * would hand every card a fresh prop on every render here and make the
   * memoisation worthless — fifty cards re-rendering on each keystroke. The
   * object is created once and its members are refreshed in place: the identity
   * never changes, and the handlers behind it are never stale.
   */
  const cardActions = useMemo(() => ({} as CardActions), []);
  Object.assign(
    cardActions,
    {
      onPaste: handlePaste,
      onDisablePrivacy: handleDisablePrivacy,
      onOcrOpen: handleOcrOpen,
      onOpenImage: handleOpenImage,
      onDragOutStart: handleCardDragOut,
      onMatchDragStart: handleMatchDragStart,
      onMatchDragEnd: handleMatchDragEnd,
      onOpenMatchPanel: (target: HistoryItem, group: TagMatchGroup) =>
        setMatchPanel({ item: target, group }),
      onContextMenu: openCardMenu,
      onHover: (target: HistoryItem) => setSelectedId(target.id),
    } satisfies CardActions,
  );

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
    // Also block localized display names of reserved tags (e.g., "链接" in Chinese)
    const localizedReserved = getLocalizedReservedNames(locale).map((n) => n.toLowerCase());
    if (localizedReserved.includes(cleaned.toLowerCase())) {
      throw new Error("This name is reserved for a system tag.");
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
    // Also block localized display names of reserved tags
    const localizedReserved = getLocalizedReservedNames(locale).map((n) => n.toLowerCase());
    if (localizedReserved.includes(cleaned.toLowerCase())) {
      throw new Error("This name is reserved for a system tag.");
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

  /**
   * Sets (or clears) a tag's auto-tagging rule. Extraction and case-folding are
   * meaningless without a pattern, so they are normalized away with it.
   */
  const handleSetManagedTagPattern = async (
    tag: string,
    pattern: string | null,
    ignoreCase: boolean,
    extract: boolean,
  ) => {
    const cleaned = pattern?.trim() || null;
    setTagManageBusy(true);
    try {
      await saveManagedTags(
        allKnownTags.map((item) =>
          item.name === tag
            ? {
                ...item,
                pattern: cleaned,
                ignoreCase: Boolean(cleaned) && ignoreCase,
                extract: Boolean(cleaned) && extract,
              }
            : item,
        ),
      );
    } finally {
      setTagManageBusy(false);
    }
  };

  /**
   * Quick rule toggle: creates the tag with the pattern already set, or updates
   * an existing tag. This avoids the race condition of calling onCreate then
   * onSetPattern separately.
   */
  const handleEnableQuickRule = async (
    tagName: string,
    color: string,
    pattern: string,
    ignoreCase: boolean,
  ) => {
    setTagManageBusy(true);
    try {
      const existing = allKnownTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (existing) {
        await saveManagedTags(
          allKnownTags.map((item) =>
            item.name === existing.name
              ? { ...item, pattern, ignoreCase, extract: true }
              : item,
          ),
        );
      } else {
        await saveManagedTags([
          ...allKnownTags,
          { name: tagName, common: false, color, pattern, ignoreCase, extract: true },
        ]);
      }
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
        if (
          !shouldHideOnBlur({
            alwaysOnTop: alwaysOnTopRef.current,
            edgeInteracting: edgeInteractingRef.current,
            suppressedUntil: suppressBlurHideUntilRef.current,
            now: Date.now(),
          })
        ) {
          return;
        }
        void appWindow.hide().catch(() => {});
      }, 160);
    };
    void appWindow.onFocusChanged(({ payload }) => {
      if (!payload) {
        if (alwaysOnTopRef.current) {
          // A pinned panel is meant to stay put, so losing focus is not a reason
          // to disappear — hiding it made the pin look broken.
          return;
        }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlersRef = useRef<Record<string, (...args: any[]) => void>>({});

  const keydownStateRef = useRef({
    activeView,
    currentPageItems,
    privacyAction,
    cardMenuOpen: cardMenu !== null,
    searchOpen,
    selectedId,
    queuedIds,
    sourceHistory,
    page,
    totalPages,
    alwaysOnTop,
    itemTagShortcut,
    itemPrivateShortcut,
    itemPinShortcut,
    itemDeleteShortcut,
    itemOcrShortcut,
    itemZoomShortcut,
    ocrEnabled,
    ocrPanelOpen: ocrPanel !== null,
    matchPanelOpen: matchPanel !== null,
    lightboxOpen: lightbox !== null,
  });
  handlersRef.current = {
    closeCardMenu,
    openCardMenuForSelected,
    handleDisablePrivacy,
    handleEnablePrivacy,
    handleTogglePin,
    handleDelete,
    handleCopyFromUI,
    toggleQueuedItem,
    handleOcrOpen,
    handleZoomSelected,
  };
  keydownStateRef.current = {
    activeView,
    currentPageItems,
    privacyAction,
    cardMenuOpen: cardMenu !== null,
    searchOpen,
    selectedId,
    queuedIds,
    sourceHistory,
    page,
    totalPages,
    alwaysOnTop,
    itemTagShortcut,
    itemPrivateShortcut,
    itemPinShortcut,
    itemDeleteShortcut,
    itemOcrShortcut,
    itemZoomShortcut,
    ocrEnabled,
    ocrPanelOpen: ocrPanel !== null,
    matchPanelOpen: matchPanel !== null,
    lightboxOpen: lightbox !== null,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A handler that has already dealt with this key marks the event, and it
      // wins: the menu, in particular, runs its own keyboard loop and its
      // Escape must close the tag form rather than the whole popup.
      if (event.defaultPrevented) return;

      const s = keydownStateRef.current;
      const h = handlersRef.current;

      if (event.key === "Escape") {
        event.preventDefault();
        // Innermost first, per `escapeTarget`. The lightbox is deliberately not
        // in that list: it closes itself, because it is the only overlay that
        // also owns other keys.
        switch (
          escapeTarget({
            privacyPrompt: Boolean(s.privacyAction),
            ocrPanel: s.ocrPanelOpen,
            matchPanel: s.matchPanelOpen,
            cardMenu: s.cardMenuOpen,
            search: s.searchOpen,
          })
        ) {
          case "ocrPanel":
            setOcrPanel(null);
            return;
          case "matchPanel":
            setMatchPanel(null);
            return;
          case "cardMenu":
            h.closeCardMenu();
            return;
          case "search":
            setSearchOpen(false);
            setSearch("");
            setDebouncedSearch("");
            return;
          default:
            return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Everything below acts on the strip, so it stands down for a full-page
      // view, for anything layered above the strip, and while the user is typing.
      // This is what keeps `Delete` from deleting the card behind the lightbox.
      const target = event.target as HTMLElement | null;
      if (
        !shouldHandleCardShortcut({
          viewOwnsKeyboard: s.activeView === "settings" || s.activeView === "tag-manager",
          overlayOpen:
            Boolean(s.privacyAction) || s.ocrPanelOpen || s.matchPanelOpen || s.lightboxOpen,
          editingField: isEditingField(target),
        })
      ) {
        return;
      }

      // The menu key and Shift+F10 mean "open the context menu for this item",
      // the same as a right click.
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        const selected =
          s.currentPageItems.find((item) => item.id === s.selectedId) ?? s.currentPageItems[0];
        if (selected) {
          event.preventDefault();
          h.openCardMenuForSelected(selected);
        }
        return;
      }

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        navigateGridSelectionRef.current(
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
        const selected = s.currentPageItems.find((item) => item.id === s.selectedId) ?? s.currentPageItems[0] ?? null;
        if (selected && shortcut === normalizeLocalShortcut(s.itemTagShortcut)) {
          event.preventDefault();
          // The key that used to open the tag picker now opens the whole menu,
          // which includes the picker: the chevron is gone, so this is the
          // keyboard route to every action.
          h.openCardMenuForSelected(selected);
          return;
        }
        if (selected && shortcut === normalizeLocalShortcut(s.itemPrivateShortcut)) {
          event.preventDefault();
          if (selected.isPrivate) h.handleDisablePrivacy(selected.id);
          else h.handleEnablePrivacy(selected.id);
          return;
        }
        if (selected && shortcut === normalizeLocalShortcut(s.itemPinShortcut)) {
          event.preventDefault();
          h.handleTogglePin(selected.id);
          return;
        }
        if (selected && shortcut === normalizeLocalShortcut(s.itemDeleteShortcut)) {
          event.preventDefault();
          h.handleDelete(selected.id);
          return;
        }
        if (
          selected &&
          selected.contentType === "image" &&
          !selected.isPrivate &&
          shortcut === normalizeLocalShortcut(s.itemZoomShortcut)
        ) {
          event.preventDefault();
          void h.handleZoomSelected(selected);
          return;
        }
        if (
          selected &&
          s.ocrEnabled &&
          selected.contentType === "image" &&
          !selected.isPrivate &&
          shortcut === normalizeLocalShortcut(s.itemOcrShortcut)
        ) {
          event.preventDefault();
          h.handleOcrOpen(selected);
          return;
        }
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (s.currentPageItems.length === 0) return;
        const selected =
          s.currentPageItems.find((item) => item.id === s.selectedId) ?? s.currentPageItems[0];
        setSelectedId(selected.id);
        h.handleCopyFromUI(selected);
        return;
      }

      // Space toggles the queue. Tab is left alone so keyboard users can walk
      // the focusable controls, which the app is full of — and a focused control
      // keeps Space too, because that is how a button is pressed from a keyboard.
      if (event.key === " ") {
        if (target?.closest("button, a, [role='button'], [role='menuitem']")) return;
        event.preventDefault();
        const selected =
          s.currentPageItems.find((item) => item.id === s.selectedId) ?? s.currentPageItems[0];
        if (!selected) return;
        h.toggleQueuedItem(selected.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    <div
      ref={shellRef}
      className="relative flex h-screen flex-col overflow-hidden rounded-xl border border-gray-200 bg-slate-50 text-gray-900"
    >
      {/* Invisible strips along the frameless window's edges, for dragging it. */}
      <div
        className="absolute left-3.5 right-3.5 top-0 z-10 h-2 select-none"
        data-tauri-drag-region
        onMouseDown={() => {
          edgeInteractingRef.current = true;
          markTransientWindowInteraction(5000);
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      <div
        className="absolute bottom-0 left-0 top-0 z-10 w-3 select-none"
        data-tauri-drag-region
        onMouseDown={() => {
          edgeInteractingRef.current = true;
          markTransientWindowInteraction(5000);
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      <div
        className="absolute bottom-0 right-0 top-0 z-10 w-3 select-none"
        data-tauri-drag-region
        onMouseDown={() => {
          edgeInteractingRef.current = true;
          markTransientWindowInteraction(5000);
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />

      <header className={navBar}>
        <button
          type="button"
          className={`h-9 w-9 ${iconButton} cursor-move`}
          title={tr(locale, "dragWindow")}
          aria-label={tr(locale, "dragWindow")}
          onMouseDown={(event) => {
            event.preventDefault();
            edgeInteractingRef.current = true;
            markTransientWindowInteraction(5000);
            void getCurrentWindow().startDragging().catch(() => {});
          }}
        >
          <GripHorizontal className="h-4 w-4" aria-hidden />
        </button>

        <button
          type="button"
          // The pinned state is one filled shape rather than a tint on top of
          // the base button: `iconButton` carries its own border and background,
          // and stacking a second set on top means the winner is whoever comes
          // later in the stylesheet.
          className={`h-9 w-9 ${alwaysOnTop ? iconButtonActive : iconButton}`}
          title={alwaysOnTop ? tr(locale, "unpinWindow") : tr(locale, "pinWindow")}
          aria-label={alwaysOnTop ? tr(locale, "unpinWindow") : tr(locale, "pinWindow")}
          aria-pressed={alwaysOnTop}
          onClick={() => {
            const next = !alwaysOnTop;
            setAlwaysOnTop(next);
            void api.setConfig({ alwaysOnTop: next }).catch((err) => {
              // The window already follows the new state, so put the button back
              // rather than leave it claiming a pin that was never saved.
              setAlwaysOnTop(!next);
              setErrorMsg("Set always-on-top failed: " + String(err));
            });
          }}
        >
          <Pin className="h-4 w-4" aria-hidden />
        </button>

        <div className="flex items-center">
          <button
            type="button"
            className={`h-9 w-9 ${iconButton}`}
            title={`${tr(locale, "search")} (tag/app/type/date/size)`}
            aria-label={tr(locale, "search")}
            aria-expanded={searchOpen}
            onClick={() => {
              const next = !searchOpen;
              setSearchOpen(next);
              if (!next) {
                setSearch("");
                setDebouncedSearch("");
              }
            }}
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
          <div
            className={`overflow-hidden transition-all duration-200 ease-out ${
              searchOpen ? "ml-2 w-72 opacity-100" : "w-0 opacity-0"
            }`}
          >
            <input
              autoFocus={searchOpen}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search… tag:work app:chrome type:text "exact phrase"'
              className={`h-9 ${input}`}
            />
          </div>
        </div>

        <button
          type="button"
          className={`h-9 w-9 ${iconButton}`}
          onClick={() => handleScrollTabs("left")}
          aria-label={tr(locale, "scrollTabsLeft")}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        {/* `p-2` paired with `-m-2`: the padding box grows by 8px on every side
            so the tabs' focus rings — and the underline, which is drawn 8px below
            the tab — are not clipped by the scroll container. The negative margin
            keeps the header's height and the tabs' width exactly as they were. */}
        <div className="eacp-scroll-none -m-2 flex flex-1 items-center gap-1 overflow-x-auto p-2" id="filter-scroll">
          {tabList.map(({ key, label, icon: Icon }) => {
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
            // The dot carries the tag's identity; the surface still uses the
            // standard active treatment so colour is never the only signal.
            const tabColor = key.startsWith("tag:")
              ? systemConfig?.color ??
                allKnownTags.find((tag) => `tag:${tag.name}` === key)?.color ??
                DEFAULT_TAG_COLOR
              : systemConfig?.color ?? null;

            return (
              <Fragment key={key}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onTabClick(key)}
                  className={`relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium ${transition} ${focusRing} active:scale-[0.98] active:translate-y-0 ${
                    active ? "text-blue-700" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tabColor ?? (active ? "#1d4ed8" : "#9ca3af") }}
                    aria-hidden
                  />
                  <span>{label}</span>
                  <TabIcon
                    className={`h-4 w-4 ${
                      key === "settings" && settingsSaveState === "saving" ? "animate-spin" : ""
                    }`}
                    aria-hidden
                  />
                  {/* Drawn 8px below the tab so it lands on the bar's bottom
                      border instead of floating above it. */}
                  {active && (
                    <span
                      className="absolute -bottom-2 left-2 right-2 h-0.5 rounded-full bg-blue-600"
                      aria-hidden
                    />
                  )}
                </button>

                {key === "tag-selector" && tagSelectorOpen && (
                  // A filled well rather than another bordered box: the tags
                  // inside each carry their own edge, and nesting the two reads
                  // as a double border.
                  <div className="eacp-scroll flex shrink-0 items-center gap-2 overflow-x-auto rounded-lg bg-gray-50 px-2 py-1.5">
                    {selectableTags.length === 0 ? (
                      <span className="px-1 text-xs text-gray-500">{tr(locale, "noTagsInline")}</span>
                    ) : (
                      selectableTags.map((tag) => {
                        const tagActive = activeTags.includes(tag.name);
                        return (
                          <button
                            key={tag.name}
                            type="button"
                            aria-pressed={tagActive}
                            style={
                              tagActive
                                ? {
                                    borderColor: `${tag.color}66`,
                                    backgroundColor: `${tag.color}14`,
                                    color: tag.color,
                                  }
                                : undefined
                            }
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${focusRing} ${
                              tagActive
                                ? ""
                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                            onClick={() => toggleTag(tag.name)}
                          >
                            {tagActive ? (
                              <CheckSquare className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <Square className="h-3.5 w-3.5" aria-hidden />
                            )}
                            <span>#{getTagDisplayName(tag.name, locale)}</span>
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

        <button
          type="button"
          className={`h-9 w-9 ${iconButton}`}
          onClick={() => handleScrollTabs("right")}
          aria-label={tr(locale, "scrollTabsRight")}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>

        {showMemoryUsage && (
          <MemoryChip
            locale={locale}
            onOpenSettings={() => {
              if (activeView !== "settings") setActiveView("settings");
            }}
          />
        )}
      </header>

      <ErrorBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />

      <main
        className={
          activeView === "settings" || activeView === "tag-manager"
            ? "eacp-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4"
            : "flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4"
        }
      >
        {/* Settings and TagManager stay mounted to preserve form state across tab switches. */}
        <div className={activeView === "settings" ? "" : "hidden"}>
          <SettingsModal ref={settingsModalRef} locale={locale} onSaved={handleSettingsSaved} />
        </div>
        <div className={activeView === "tag-manager" ? "" : "hidden"}>
          <TagManagementPage
            tags={allKnownTags}
            tagCounts={tagCountMap}
            busy={tagManageBusy}
            onCreate={handleCreateManagedTag}
            onRename={handleRenameManagedTag}
            onDelete={handleDeleteManagedTag}
            onToggleCommon={handleToggleManagedTagCommon}
            onSetColor={handleSetManagedTagColor}
            onSetPattern={handleSetManagedTagPattern}
            onEnableQuickRule={handleEnableQuickRule}
            locale={locale}
          />
        </div>
        {activeView !== "settings" && activeView !== "tag-manager" && (
          <>
            {filtered.length === 0 ? (
              <EmptyState
                locale={locale}
                filtered={hasFilters && sourceHistory.length > 0}
                onClear={hasFilters ? clearFilters : undefined}
              />
            ) : (
              <div
                ref={cardStripRef}
                id="card-scroll"
                // The padding is what clears the selected card's `ring-2`: a scroll
                // container clips at its padding box, so any bleed has to be inside
                // it. Cards sit directly in the lower area — no recessed well.
                className={`eacp-scroll flex h-full gap-4 overflow-x-auto overflow-y-hidden p-3 ${transition} ${
                  stripDropActive ? "!bg-blue-50 ring-2 ring-blue-500" : ""
                }`}
                onDragOver={handleStripDragOver}
                onDragLeave={handleStripDragLeave}
                onDrop={handleStripDrop}
              >
                {page > 0 && (
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    className={`flex h-full w-[260px] shrink-0 flex-col items-center justify-center gap-2 text-gray-500 ${surface} ${surfaceInteractive} active:scale-[0.98] active:translate-y-0 ${focusRing}`}
                  >
                    <Ellipsis className="h-8 w-8" aria-hidden />
                    <span className="text-sm font-medium">{tr(locale, "loadPrevious")}</span>
                    <small className="text-xs text-gray-400">
                      {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)}
                    </small>
                  </button>
                )}

                {currentPageItems.map((item, itemIndex) => (
                  <ClipboardCard
                    key={item.id}
                    item={item}
                    actions={cardActions}
                    tagColors={tagColorMap}
                    isSelected={selectedId === item.id}
                    quickSlot={quickSlotIndex(page, hasFilters, itemIndex)}
                    queueSlot={queueOrderFor(item.id)}
                    locale={locale}
                  />
                ))}

                {page < totalPages - 1 && (
                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    className={`flex h-full w-[260px] shrink-0 flex-col items-center justify-center gap-2 text-gray-500 ${surface} ${surfaceInteractive} active:scale-[0.98] active:translate-y-0 ${focusRing}`}
                  >
                    <Ellipsis className="h-8 w-8" aria-hidden />
                    <span className="text-sm font-medium">{tr(locale, "loadNext")}</span>
                    <small className="text-xs text-gray-400">
                      {page * pageSize + currentPageItems.length + 1}-
                      {Math.min((page + 2) * pageSize, filtered.length)}
                    </small>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {cardMenu && menuItem && (
        <CardContextMenu
          // Changing item rebuilds the menu, so the Tag panel and the inline
          // "new tag" form do not leak from one card to the next.
          key={menuItem.id}
          item={menuItem}
          anchor={{ x: cardMenu.x, y: cardMenu.y }}
          availableTags={assignableTagNames}
          locale={locale}
          isCopied={copiedId === menuItem.id}
          ocrBusy={ocrBusyId === menuItem.id}
          ocrEnabled={ocrEnabled}
          apiTranslateEnabled={apiTranslateEnabled}
          zoomShortcut={itemZoomShortcut}
          onClose={closeCardMenu}
          onPaste={handlePaste}
          onCopy={handleCopyFromUI}
          onTogglePin={handleTogglePin}
          onDelete={handleDelete}
          onToggleTag={handleToggleTag}
          onCreateTag={handleCreateAndAttachTag}
          onEnablePrivacy={handleEnablePrivacy}
          onDisablePrivacy={handleDisablePrivacy}
          onQuickEdit={handleQuickEdit}
          onOcrOpen={handleOcrOpen}
          onZoom={handleZoomSelected}
          onNotify={setErrorMsg}
        />
      )}

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

      {ocrPanel && (
        <OcrResultModal
          key={ocrPanel.item.id}
          item={ocrPanel.item}
          locale={locale}
          initialText={ocrPanel.text}
          apiTranslateEnabled={apiTranslateEnabled}
          onClose={() => setOcrPanel(null)}
          onCopyText={(text) => handleOcrCopyText(ocrPanel.item, text)}
          onPasteText={(text) => void handleOcrPasteText(ocrPanel.item, text)}
          onSavedAsItem={() => void reloadHistory()}
          onNotify={setErrorMsg}
        />
      )}

      {lightbox && (
        <ImageLightbox
          key={lightbox.item.id}
          item={lightbox.item}
          src={lightbox.src}
          locale={locale}
          onClose={() => setLightbox(null)}
          onCopy={(target) => void handleCopyFromUI(target)}
          onPaste={(target) => void handlePaste(target)}
        />
      )}

      {matchPanel && (
        <MatchPanel
          item={matchPanel.item}
          group={matchPanel.group}
          tagColors={tagColorMap}
          locale={locale}
          onClose={() => setMatchPanel(null)}
          onMatchDragStart={handleMatchDragStart}
          onMatchDragEnd={handleMatchDragEnd}
          onCreateCard={handleCreateCardFromText}
        />
      )}

      {showWelcome && (
        <WelcomeGuide
          locale={locale}
          onClose={() => {
            localStorage.setItem("eacp-welcome-seen", "1");
            setShowWelcome(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Puts an image on the clipboard.
 *
 * Keyed by item id when there is one, which is the same file the drag-out
 * prewarm uses: copying the same image repeatedly reuses one temp file instead
 * of leaving a timestamped one behind per copy.
 */
async function writeImageDataUrl(dataUrl: string, itemId?: number): Promise<void> {
  const imagePath =
    itemId && itemId > 0
      ? await api.stageImageForDrag(itemId)
      : await api.saveTempImage(dataUrl);
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
