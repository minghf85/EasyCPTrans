import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileText,
  Files,
  GripHorizontal,
  Info,
  Monitor,
  Pin,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Star,
  Tags as TagsIcon,
  X,
} from "lucide-react";

import { ClipboardCard, type CardActions } from "../../src/components/ClipboardCard";
import { CardContextMenu } from "../../src/components/CardContextMenu";
import { EmptyState } from "../../src/components/EmptyState";
import { ImageLightbox } from "../../src/components/ImageLightbox";
import { MatchPanel, MATCH_DRAG_MIME } from "../../src/components/RegexMatchStack";
import { OcrResultModal } from "../../src/components/OcrResultModal";
import { PasswordPromptModal } from "../../src/components/PasswordPromptModal";
import { SettingsModal, type SettingsModalHandle } from "../../src/components/SettingsModal";
import { TagManagementPage } from "../../src/components/TagManagementPage";
import {
  buttonPrimary,
  buttonSecondary,
  focusRing,
  iconButton,
  iconButtonActive,
  input,
  modalPanel,
  navBar,
  overlay,
  surfaceInteractive,
  transition,
} from "../../src/components/ui";
import { escapeTarget, isEditingField, shouldHandleCardShortcut } from "../../src/lib/interactionRules";
import { quickSlotIndex } from "../../src/lib/cardInteraction";
import {
  aggregateTags,
  applyFilters,
  isFilterActive,
  type FilterState,
  type Scope,
} from "../../src/lib/filter";
import { tr, type Locale } from "../../src/lib/i18n";
import { getTagDisplayName } from "../../src/lib/tagDisplay";
import { collectTagMatches, type TagMatchGroup } from "../../src/lib/tagMatches";
import type { DragChipBitmap } from "../../src/lib/dragChip";
import type { HistoryItem, ManagedTag } from "../../src/types";

import { bitmapToDataUrl } from "./demo/bitmap";
import { DEMO_ITEMS, DEMO_TAGS, SAMPLE_IMAGES, sortDemoItems } from "./demo/data";
import {
  DEMO_OCR_TEXT_EVENT,
  DEMO_TRANSLATED_EVENT,
  demoBus,
  type DemoOcrTextDetail,
  type DemoTranslationDetail,
} from "./demo/bus";

/* ────────────────────────────── Copy ───────────────────────────────────── */

export type SiteLang = "zh" | "en";

const UI = {
  zh: {
    eyebrow: "在线体验",
    title: "这就是面板本身，随便点",
    desc: "下面复用桌面版同一套 React 组件：卡片、右键菜单、搜索、标签、设置页和快捷键都是真的，只有数据是示例。",
    hintLabel: "快速试一下",
    hints: {
      search: "搜索 tag:code",
      image: "只看图片",
      tags: "展开标签",
      wordCard: "单词卡片",
      regex: "正则提取",
      queue: "加入队列",
      reset: "重置演示",
    },
    targetTitle: "notes.txt — Notepad",
    targetSubtitle: "上一个窗口",
    targetEmpty: "点击任意卡片，内容会粘贴到这里。拖动文件或图片卡片，也会“拖”过来。",
    targetImage: "图片已粘贴",
    panelNote: "桌面版快捷键：T 菜单 · P 置顶 · M 私密 · O 识别 · Z 放大 · Space 队列 · Enter 复制",
    pasted: "已粘贴到 Notepad（演示）",
    copied: "已复制到剪贴板",
    pinOn: "已置顶",
    pinOff: "已取消置顶",
    deleted: "已删除卡片",
    queued: "已加入队列，卡片上出现 Q1",
    queueEmpty: "队列是空的：先选中一张卡片并按 Space",
    queuePasted: "已按队列顺序粘贴下一条",
    privateOn: "已设为私密（演示密码可以是任意内容）",
    privateOff: "已解锁（演示）",
    privateLocked: "私密内容需要先解锁：右键卡片 → 解锁",
    dragText: "文本暂不支持拖出；换成文件或图片卡片试试",
    dragPrivate: "私密内容无法拖出，请先解锁",
    dragDropped: "已拖到 Notepad（演示）",
    saved: "设置已保存（演示不会写入磁盘）",
    translated: "已生成翻译卡片",
    tagCreated: "标签已创建",
    tagRenamed: "标签已重命名",
    tagDeleted: "标签已删除",
    tutorial: "桌面版会在首次启动时播放聚光灯教程；这里可以直接操作，不用跟步骤。",
    ocrSaved: "已把识别结果存成一张文字卡片",
    matchCreated: "已从匹配项生成新卡片",
    editTitle: "编辑文本",
    editSave: "保存修改",
    editCancel: "取消",
    editPlaceholder: "卡片内容…",
    privacyEnableTitle: "设为私密",
    privacyEnableDesc: "演示环境接受任意密码。桌面版会用 Argon2 + AES-GCM 加密内容。",
    privacyDisableTitle: "解锁私密内容",
    privacyDisableDesc: "演示环境接受任意密码。",
    privacyConfirm: "确认",
    clearSearch: "清除搜索",
  },
  en: {
    eyebrow: "Live demo",
    title: "This is the panel itself. Click around.",
    desc: "The demo reuses the desktop app's own React components: cards, context menu, search, tags, settings, and shortcuts are real. Only the data is sampled.",
    hintLabel: "Try it",
    hints: {
      search: "Search tag:code",
      image: "Images only",
      tags: "Open tags",
      wordCard: "Word card",
      regex: "Regex extract",
      queue: "Add to queue",
      reset: "Reset demo",
    },
    targetTitle: "notes.txt — Notepad",
    targetSubtitle: "previous window",
    targetEmpty:
      "Click a card and its content lands here. Drag a file or image card to “drop” it here too.",
    targetImage: "Image pasted",
    panelNote:
      "Desktop keys: T menu · P pin · M private · O OCR · Z zoom · Space queue · Enter copy",
    pasted: "Pasted into Notepad (demo)",
    copied: "Copied to the clipboard",
    pinOn: "Pinned",
    pinOff: "Unpinned",
    deleted: "Card deleted",
    queued: "Added to the queue — Q1 appears on the card",
    queueEmpty: "The queue is empty: select a card and press Space",
    queuePasted: "Pasted the next queued item",
    privateOn: "Protected (any password works in the demo)",
    privateOff: "Unlocked (demo)",
    privateLocked: "Unlock this private item first: right-click the card → Unlock",
    dragText: "Text cannot be dragged out — try a file or image card",
    dragPrivate: "Private content cannot be dragged out; unlock it first",
    dragDropped: "Dropped into Notepad (demo)",
    saved: "Settings saved (the demo does not write to disk)",
    translated: "Translation card created",
    tagCreated: "Tag created",
    tagRenamed: "Tag renamed",
    tagDeleted: "Tag deleted",
    tutorial: "The desktop app plays a spotlight tour on first launch; here you can just try things.",
    ocrSaved: "Saved the OCR result as a text card",
    matchCreated: "Created a card from the match",
    editTitle: "Edit text",
    editSave: "Save changes",
    editCancel: "Cancel",
    editPlaceholder: "Card content…",
    privacyEnableTitle: "Make private",
    privacyEnableDesc:
      "The demo accepts any password. The desktop app encrypts content with Argon2 and AES-GCM.",
    privacyDisableTitle: "Unlock private content",
    privacyDisableDesc: "The demo accepts any password.",
    privacyConfirm: "Confirm",
    clearSearch: "Clear search",
  },
} as const;

/* ────────────────────────────── Types ──────────────────────────────────── */

type DemoTab =
  | Scope
  | "tag-selector"
  | "tag-manager"
  | "settings"
  | `tag:${string}`;

type TargetContent =
  | { kind: "text"; value: string }
  | { kind: "image"; value: string; width?: string; height?: string }
  | { kind: "file"; values: string[] };

interface PrivacyAction {
  id: number;
  mode: "enable" | "disable";
}

interface DemoSectionProps {
  locale: Locale;
  lang: SiteLang;
  onLocaleChange: (locale: Locale) => void;
}

/* ────────────────────────────── Helpers ────────────────────────────────── */

function cloneItem(item: HistoryItem): HistoryItem {
  return {
    ...item,
    tags: [...item.tags],
    metadata: Object.fromEntries(
      Object.entries(item.metadata).map(([key, values]) => [key, [...values]]),
    ),
  };
}

function freshItems() {
  return sortDemoItems(DEMO_ITEMS.map(cloneItem));
}

function freshTags() {
  return DEMO_TAGS.map((tag) => ({ ...tag }));
}

function toggleInList(values: string[], value: string, enabled: boolean) {
  const lower = value.toLowerCase();
  const rest = values.filter((entry) => entry.toLowerCase() !== lower);
  return enabled ? [...rest, value] : rest;
}

function targetContent(item: HistoryItem): TargetContent {
  if (item.contentType === "image") {
    return {
      kind: "image",
      value: item.content || SAMPLE_IMAGES[item.id] || "",
      width: item.metadata?.width?.[0],
      height: item.metadata?.height?.[0],
    };
  }
  if (item.contentType === "file") {
    return {
      kind: "file",
      values: item.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    };
  }
  return { kind: "text", value: item.content };
}

/* ────────────────────────────── Demo panel ─────────────────────────────── */

export function DemoSection({ locale, lang, onLocaleChange }: DemoSectionProps) {
  const copy = UI[lang];

  const [items, setItems] = useState<HistoryItem[]>(freshItems);
  const [tags, setTags] = useState<ManagedTag[]>(freshTags);
  const [scope, setScope] = useState<Scope>("all");
  const [activeView, setActiveView] = useState<DemoTab>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [queuedIds, setQueuedIds] = useState<number[]>([]);
  const [cardMenu, setCardMenu] = useState<{ itemId: number; x: number; y: number } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [lightbox, setLightbox] = useState<{ item: HistoryItem; src: string } | null>(null);
  const [matchPanel, setMatchPanel] = useState<{ item: HistoryItem; group: TagMatchGroup } | null>(
    null,
  );
  const [matchDragging, setMatchDragging] = useState(false);
  const [stripDropActive, setStripDropActive] = useState(false);
  const [ocrPanel, setOcrPanel] = useState<{ item: HistoryItem; text: string } | null>(null);
  const [privacyAction, setPrivacyAction] = useState<PrivacyAction | null>(null);
  const [quickEdit, setQuickEdit] = useState<HistoryItem | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const settingsRef = useRef<SettingsModalHandle | null>(null);

  const [target, setTarget] = useState<TargetContent | null>(null);
  const [targetFlash, setTargetFlash] = useState(false);
  const [dragGhost, setDragGhost] = useState<{
    src: string | null;
    x: number;
    y: number;
    item: HistoryItem;
  } | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const nextIdRef = useRef(3000);

  const filterState: FilterState = {
    search,
    scope,
    activeTags,
    timeRange: [null, null],
    textLen: [null, null],
    fileSize: [null, null],
  };
  const filtered = useMemo(() => applyFilters(items, filterState), [items, search, scope, activeTags]);
  const currentPageItems = filtered;
  const hasFilters = isFilterActive(filterState);

  const tagCountMap = useMemo(() => new Map(aggregateTags(items).map((entry) => [entry.tag, entry.count])), [items]);
  const tagColorMap = useMemo(
    () => Object.fromEntries(tags.map((tag) => [tag.name.toLowerCase(), tag.color])),
    [tags],
  );
  const assignableTags = useMemo(
    () => tags.filter((tag) => !tag.system).map((tag) => tag.name),
    [tags],
  );
  const selectableTags = useMemo(
    () =>
      [...tags].sort(
        (a, b) =>
          Number(Boolean(b.system)) - Number(Boolean(a.system)) ||
          Number(Boolean(b.common)) - Number(Boolean(a.common)) ||
          (tagCountMap.get(b.name) ?? 0) - (tagCountMap.get(a.name) ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [tags, tagCountMap],
  );

  const tabs = useMemo(() => {
    const system: Array<{ key: DemoTab; label: string; icon: typeof FileText; color: string | null }> = [
      { key: "all", label: tr(locale, "all"), icon: FileText, color: null },
      { key: "text", label: tr(locale, "text"), icon: FileText, color: "#0078d4" },
      { key: "image", label: tr(locale, "image"), icon: FileImage, color: "#107c10" },
      { key: "file", label: tr(locale, "file"), icon: Files, color: "#7b4f9d" },
      { key: "pinned", label: tr(locale, "pinned"), icon: Star, color: "#d83b01" },
    ];

    const devices = tags
      .filter((tag) => tag.system && tag.id?.startsWith("sys-device-"))
      .map((tag) => ({
        key: `tag:${tag.name}` as DemoTab,
        label: `#${tag.name}`,
        icon: Monitor,
        color: tag.color,
      }));

    const functional = tags
      .filter((tag) => tag.system && (tag.id === "sys-word" || tag.id === "sys-private") && tag.common)
      .map((tag) => ({
        key: `tag:${tag.name}` as DemoTab,
        label: `#${getTagDisplayName(tag.name, locale)}`,
        icon: TagsIcon,
        color: tag.color,
      }));

    const custom = tags
      .filter((tag) => tag.common && !tag.system)
      .map((tag) => ({
        key: `tag:${tag.name}` as DemoTab,
        label: `#${getTagDisplayName(tag.name, locale)}`,
        icon: TagsIcon,
        color: tag.color,
      }));

    return [
      ...system,
      ...devices,
      ...functional,
      ...custom,
      { key: "tag-selector" as DemoTab, label: tr(locale, "tags"), icon: TagsIcon, color: null },
      { key: "tag-manager" as DemoTab, label: tr(locale, "tagAdmin"), icon: TagsIcon, color: null },
      { key: "settings" as DemoTab, label: tr(locale, "settings"), icon: Settings2, color: null },
    ];
  }, [locale, tags]);

  const menuItem = cardMenu ? items.find((item) => item.id === cardMenu.itemId) ?? null : null;
  const queueOrderFor = (id: number) => {
    const index = queuedIds.indexOf(id);
    return index >= 0 ? index + 1 : null;
  };

  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Same wheel behaviour as the desktop panel: the wheel moves the card strip
  // and the tab bar sideways, while a nested scroller keeps the event until it
  // reaches its own end.
  useEffect(() => {
    const bind = (id: string) => {
      const node = document.getElementById(id);
      if (!node) return () => {};
      const onWheel = (event: WheelEvent) => {
        const target = event.target as HTMLElement | null;
        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
        if (delta === 0) return;

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

    const unbindTabs = bind("demo-filter-scroll");
    const unbindCards = bind("demo-card-scroll");
    return () => {
      unbindTabs();
      unbindCards();
    };
  }, [activeView, currentPageItems.length]);

  // Keep a card selected, and let the card under the pointer become the current
  // one — the same rule the desktop app uses for its keyboard actions.
  useEffect(() => {
    if (activeView === "settings" || activeView === "tag-manager") return;
    if (currentPageItems.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!currentPageItems.some((item) => item.id === selectedId)) {
      setSelectedId(currentPageItems[0].id);
    }
  }, [activeView, currentPageItems, selectedId]);

  // Keep the ghost under the pointer while a simulated drag is in flight.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      setDragGhost((current) =>
        current ? { ...current, x: event.clientX, y: event.clientY } : current,
      );
    };
    window.addEventListener("pointermove", onMove, true);
    return () => window.removeEventListener("pointermove", onMove, true);
  }, []);

  // A translation performed from the context menu becomes a card, the same way
  // the desktop backend creates one and broadcasts `clipboard-changed`.
  useEffect(() => {
    const onTranslated = (event: Event) => {
      const detail = (event as CustomEvent<DemoTranslationDetail>).detail;
      if (!detail?.text) return;
      const id = nextIdRef.current++;
      const item: HistoryItem = {
        id,
        contentType: "text",
        content: `# ${detail.text.slice(0, 80)}\n\n## 翻译（${detail.targetLang}）\n\n- 这是在线演示生成的示例翻译。\n- 桌面版会调用你在设置里配置的 OpenAI 兼容接口。\n\n---\n\n${detail.text}`,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        useCount: 1,
        pinned: false,
        isPrivate: false,
        tags: ["Word"],
        metadata: {
          translationStatus: ["done"],
          wordQuery: [detail.text.slice(0, 80)],
          sourceApp: ["EasyCPTrans"],
          appName: ["EasyCPTrans"],
        },
      };
      setItems((prev) => sortDemoItems([...prev, item]));
      setSelectedId(id);
      notify(copy.translated);
    };
    demoBus.addEventListener(DEMO_TRANSLATED_EVENT, onTranslated);
    return () => demoBus.removeEventListener(DEMO_TRANSLATED_EVENT, onTranslated);
  }, [copy.translated, notify]);

  // The OCR review panel edits through `set_ocr_text`; keep the demo's copy in
  // sync so "Save as a text card" stores the edited text, not the first draft.
  useEffect(() => {
    const onOcrText = (event: Event) => {
      const detail = (event as CustomEvent<DemoOcrTextDetail>).detail;
      if (!detail) return;
      setOcrPanel((current) =>
        current && current.item.id === detail.id ? { ...current, text: detail.text } : current,
      );
      setItems((prev) =>
        prev.map((item) =>
          item.id === detail.id
            ? { ...item, metadata: { ...item.metadata, ocrText: [detail.text] } }
            : item,
        ),
      );
    };
    demoBus.addEventListener(DEMO_OCR_TEXT_EVENT, onOcrText);
    return () => demoBus.removeEventListener(DEMO_OCR_TEXT_EVENT, onOcrText);
  }, []);

  /* ────────────── Card operations ────────────── */

  const markUsed = (id: number) => {
    setItems((prev) =>
      sortDemoItems(
        prev.map((item) =>
          item.id === id
            ? { ...item, lastUsedAt: new Date().toISOString(), useCount: item.useCount + 1 }
            : item,
        ),
      ),
    );
  };

  const showTarget = (content: TargetContent) => {
    setTarget(content);
    setTargetFlash(true);
    window.setTimeout(() => setTargetFlash(false), 950);
  };

  const pasteItem = (item: HistoryItem) => {
    if (item.isPrivate) {
      notify(copy.privateLocked);
      return;
    }
    showTarget(targetContent(item));
    markUsed(item.id);
    setSelectedId(item.id);
    notify(`${copy.pasted} · ${item.contentType}`);
  };

  const copyItem = (item: HistoryItem) => {
    if (item.isPrivate) {
      notify(copy.privateLocked);
      return;
    }
    if (item.contentType === "text" && navigator.clipboard) {
      void navigator.clipboard.writeText(item.content).catch(() => {});
    }
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 1400);
    notify(copy.copied);
  };

  const togglePin = (id: number) => {
    setItems((prev) =>
      sortDemoItems(
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                pinned: !item.pinned,
                tags: toggleInList(item.tags, "Pinned", !item.pinned),
              }
            : item,
        ),
      ),
    );
    const item = items.find((entry) => entry.id === id);
    notify(item?.pinned ? copy.pinOff : copy.pinOn);
  };

  const deleteItem = (id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setQueuedIds((prev) => prev.filter((entry) => entry !== id));
    if (selectedId === id) setSelectedId(null);
    setCardMenu(null);
    notify(copy.deleted);
  };

  const toggleTag = (id: number, tag: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              tags: item.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase())
                ? item.tags.filter((entry) => entry.toLowerCase() !== tag.toLowerCase())
                : [...item.tags, tag],
            }
          : item,
      ),
    );
  };

  const createTag = async (id: number, name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    setTags((prev) =>
      prev.some((tag) => tag.name.toLowerCase() === cleaned.toLowerCase())
        ? prev
        : [...prev, { id: `demo-${cleaned}`, name: cleaned, common: false, color: "#0f6cbd" }],
    );
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && !item.tags.some((tag) => tag.toLowerCase() === cleaned.toLowerCase())
          ? { ...item, tags: [...item.tags, cleaned] }
          : item,
      ),
    );
    notify(copy.tagCreated);
  };

  const toggleQueue = (id: number) => {
    setQueuedIds((prev) => {
      if (prev.includes(id)) return prev.filter((entry) => entry !== id);
      notify(copy.queued);
      return [...prev, id];
    });
  };

  const pasteNextQueued = () => {
    const nextId = queuedIds.find((id) => items.some((item) => item.id === id));
    if (!nextId) {
      notify(copy.queueEmpty);
      return;
    }
    const item = items.find((entry) => entry.id === nextId);
    if (!item) return;
    setQueuedIds((prev) => prev.filter((entry) => entry !== nextId));
    showTarget(targetContent(item));
    markUsed(item.id);
    notify(copy.queuePasted);
  };

  const openOcr = (item: HistoryItem) => {
    setOcrPanel({ item, text: item.metadata?.ocrText?.[0] ?? "" });
    setCardMenu(null);
  };

  const zoomImage = (item: HistoryItem) => {
    if (item.contentType !== "image") return;
    setLightbox({ item, src: item.content || SAMPLE_IMAGES[item.id] || "" });
    setCardMenu(null);
  };

  const openPrivacy = (id: number, mode: "enable" | "disable") => {
    setPrivacyAction({ id, mode });
    setCardMenu(null);
  };

  const confirmPrivacy = (_password: string) => {
    if (!privacyAction) return;
    const { id, mode } = privacyAction;
    const enabled = mode === "enable";
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, isPrivate: enabled, tags: toggleInList(item.tags, "Private", enabled) }
          : item,
      ),
    );
    setPrivacyAction(null);
    notify(enabled ? copy.privateOn : copy.privateOff);
  };

  const openQuickEdit = (item: HistoryItem) => {
    setQuickEdit(item);
    setEditDraft(item.content);
    setCardMenu(null);
  };

  const saveQuickEdit = () => {
    if (!quickEdit) return;
    const content = editDraft.trim() ? editDraft : quickEdit.content;
    setItems((prev) =>
      prev.map((item) =>
        item.id === quickEdit.id
          ? {
              ...item,
              content,
              metadata: { ...item.metadata, length: [content.length.toString()] },
            }
          : item,
      ),
    );
    setQuickEdit(null);
    notify(copy.saved);
  };

  const openMenuFor = (item: HistoryItem) => {
    const rect = document.getElementById(`history-item-${item.id}`)?.getBoundingClientRect();
    setSelectedId(item.id);
    setCardMenu({
      itemId: item.id,
      x: rect ? rect.left + 24 : window.innerWidth / 2,
      y: rect ? rect.top + 48 : window.innerHeight / 2,
    });
  };

  const createCardFromText = (value: string) => {
    const content = value.trim();
    if (!content) return;
    const id = nextIdRef.current++;
    const item: HistoryItem = {
      id,
      contentType: "text",
      content,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 1,
      pinned: false,
      isPrivate: false,
      tags: [],
      metadata: {
        length: [content.length.toString()],
        sourceApp: ["EasyCPTrans"],
        appName: ["EasyCPTrans"],
      },
    };
    setItems((prev) => sortDemoItems([...prev, item]));
    setSelectedId(id);
    setMatchPanel(null);
    notify(copy.matchCreated);
  };

  const dragOut = async (item: HistoryItem, preview: DragChipBitmap | null) => {
    if (item.isPrivate) {
      notify(copy.dragPrivate);
      return;
    }
    if (item.contentType === "text") {
      notify(copy.dragText);
      return;
    }
    setDragGhost({
      src: bitmapToDataUrl(preview),
      x: pointerRef.current.x,
      y: pointerRef.current.y,
      item,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setDragGhost(null);
    showTarget(targetContent(item));
    markUsed(item.id);
    notify(copy.dragDropped);
  };

  const cardActions: CardActions = {
    onPaste: pasteItem,
    onDisablePrivacy: (id) => openPrivacy(id, "disable"),
    onOcrOpen: openOcr,
    onOpenImage: (item, src) => setLightbox({ item, src }),
    onDragOutStart: dragOut,
    onMatchDragStart: (value, event: ReactDragEvent) => {
      event.dataTransfer.setData(MATCH_DRAG_MIME, value);
      event.dataTransfer.setData("text/plain", value);
      event.dataTransfer.effectAllowed = "copy";
      setMatchDragging(true);
    },
    onMatchDragEnd: () => {
      setMatchDragging(false);
      setStripDropActive(false);
    },
    onOpenMatchPanel: (item, group) => setMatchPanel({ item, group }),
    onContextMenu: (item, anchor) => {
      setSelectedId(item.id);
      setCardMenu({ itemId: item.id, x: anchor.x, y: anchor.y });
    },
    onHover: (target) => setSelectedId(target.id),
  };

  const handleStripDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const value =
      event.dataTransfer.getData(MATCH_DRAG_MIME) || event.dataTransfer.getData("text/plain");
    setMatchDragging(false);
    setStripDropActive(false);
    if (value) createCardFromText(value);
  };

  /* ────────────── Tabs, tags, settings ────────────── */

  const onTabClick = (key: DemoTab) => {
    if (key === "settings" && activeView === "settings") {
      if (settingsSaveState === "saving") return;
      const task = settingsRef.current?.save();
      if (!task) return;
      setSettingsSaveState("saving");
      void task
        .then(() => {
          setSettingsSaveState("saved");
          window.setTimeout(() => setSettingsSaveState("idle"), 1200);
        })
        .catch((err) => {
          setSettingsSaveState("error");
          notify(String(err));
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
      setCardMenu(null);
      return;
    }
    if (key.startsWith("tag:")) {
      setScope("all");
      setActiveTags([key.slice(4)]);
      return;
    }
    setActiveTags([]);
    setScope(key as Scope);
  };

  const toggleActiveTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSearch("");
    setScope("all");
    setActiveTags([]);
    setActiveView("all");
    setTagSelectorOpen(false);
  };

  const resetDemo = () => {
    setItems(freshItems());
    setTags(freshTags());
    setScope("all");
    setActiveView("all");
    setActiveTags([]);
    setTagSelectorOpen(false);
    setSearch("");
    setSearchOpen(false);
    setSelectedId(null);
    setQueuedIds([]);
    setCardMenu(null);
    setToast(null);
    setTarget(null);
  };

  const handleSettingsSaved = (settings: {
    locale: Locale;
    pageSize: number;
    historyLimit: number;
  }) => {
    onLocaleChange(settings.locale);
    notify(UI[lang].saved);
  };

  /* Tag Admin */
  const handleCreateManagedTag = async (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    setTags((prev) =>
      prev.some((tag) => tag.name.toLowerCase() === cleaned.toLowerCase())
        ? prev
        : [...prev, { id: `demo-${cleaned}`, name: cleaned, common: true, color: "#0f6cbd" }],
    );
    notify(copy.tagCreated);
  };

  const handleRenameManagedTag = async (from: string, to: string) => {
    const cleaned = to.trim();
    if (!cleaned) return;
    setTags((prev) => prev.map((tag) => (tag.name === from ? { ...tag, name: cleaned } : tag)));
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        tags: item.tags.map((tag) => (tag === from ? cleaned : tag)),
      })),
    );
    setActiveTags((prev) => prev.map((tag) => (tag === from ? cleaned : tag)));
    notify(copy.tagRenamed);
  };

  const handleDeleteManagedTag = async (name: string) => {
    setTags((prev) => prev.filter((tag) => tag.name !== name));
    setItems((prev) =>
      prev.map((item) => ({ ...item, tags: item.tags.filter((tag) => tag !== name) })),
    );
    setActiveTags((prev) => prev.filter((tag) => tag !== name));
    notify(copy.tagDeleted);
  };

  const handleToggleManagedTagCommon = async (name: string) => {
    setTags((prev) =>
      prev.map((tag) => (tag.name === name ? { ...tag, common: !tag.common } : tag)),
    );
  };

  const handleSetManagedTagColor = async (name: string, color: string) => {
    setTags((prev) => prev.map((tag) => (tag.name === name ? { ...tag, color } : tag)));
  };

  const handleSetManagedTagPattern = async (
    name: string,
    pattern: string | null,
    ignoreCase: boolean,
    extract: boolean,
  ) => {
    setTags((prev) =>
      prev.map((tag) =>
        tag.name === name ? { ...tag, pattern, ignoreCase, extract: Boolean(pattern) && extract } : tag,
      ),
    );
  };

  const handleEnableQuickRule = async (
    name: string,
    color: string,
    pattern: string,
    ignoreCase: boolean,
  ) => {
    setTags((prev) => {
      const existing = prev.find((tag) => tag.name === name);
      if (existing) {
        return prev.map((tag) =>
          tag.name === name ? { ...tag, color, pattern, ignoreCase, extract: true, common: true } : tag,
        );
      }
      return [
        ...prev,
        { id: `demo-${name}`, name, common: true, color, pattern, ignoreCase, extract: true },
      ];
    });
  };

  /* ────────────── Keyboard ────────────── */

  const keyStateRef = useRef({
    activeView,
    items: currentPageItems,
    selectedId,
    queuedIds,
    menuOpen: cardMenu !== null,
    searchOpen,
    ocrOpen: ocrPanel !== null,
    matchOpen: matchPanel !== null,
    lightboxOpen: lightbox !== null,
    privacyOpen: privacyAction !== null,
    editOpen: quickEdit !== null,
  });
  keyStateRef.current = {
    activeView,
    items: currentPageItems,
    selectedId,
    queuedIds,
    menuOpen: cardMenu !== null,
    searchOpen,
    ocrOpen: ocrPanel !== null,
    matchOpen: matchPanel !== null,
    lightboxOpen: lightbox !== null,
    privacyOpen: privacyAction !== null,
    editOpen: quickEdit !== null,
  };

  const handlersRef = useRef({
    closeMenu: () => setCardMenu(null),
    openMenuFor,
    togglePin,
    openPrivacy,
    deleteItem,
    copyItem,
    toggleQueue,
    pasteNextQueued,
    openOcr,
    zoomImage,
    setSelected: (id: number) => setSelectedId(id),
    closeSearch: () => {
      setSearchOpen(false);
      setSearch("");
    },
    closeOcr: () => setOcrPanel(null),
    closeMatch: () => setMatchPanel(null),
    closePrivacy: () => setPrivacyAction(null),
    closeEdit: () => setQuickEdit(null),
  });
  handlersRef.current = {
    closeMenu: () => setCardMenu(null),
    openMenuFor,
    togglePin,
    openPrivacy,
    deleteItem,
    copyItem,
    toggleQueue,
    pasteNextQueued,
    openOcr,
    zoomImage,
    setSelected: (id: number) => setSelectedId(id),
    closeSearch: () => {
      setSearchOpen(false);
      setSearch("");
    },
    closeOcr: () => setOcrPanel(null),
    closeMatch: () => setMatchPanel(null),
    closePrivacy: () => setPrivacyAction(null),
    closeEdit: () => setQuickEdit(null),
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const s = keyStateRef.current;
      const h = handlersRef.current;
      const targetElement = event.target as HTMLElement | null;

      if (event.key === "Escape") {
        event.preventDefault();
        switch (
          escapeTarget({
            privacyPrompt: s.privacyOpen,
            ocrPanel: s.ocrOpen,
            matchPanel: s.matchOpen,
            cardMenu: s.menuOpen,
            search: s.searchOpen,
          })
        ) {
          case "privacyPrompt":
            h.closePrivacy();
            return;
          case "ocrPanel":
            h.closeOcr();
            return;
          case "matchPanel":
            h.closeMatch();
            return;
          case "cardMenu":
            h.closeMenu();
            return;
          case "search":
            h.closeSearch();
            return;
          default:
            if (s.editOpen) h.closeEdit();
            return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        h.pasteNextQueued();
        return;
      }

      if (
        !shouldHandleCardShortcut({
          viewOwnsKeyboard: s.activeView === "settings" || s.activeView === "tag-manager",
          overlayOpen: s.privacyOpen || s.ocrOpen || s.matchOpen || s.lightboxOpen || s.editOpen,
          editingField: isEditingField(targetElement),
        })
      ) {
        return;
      }

      const selected =
        s.items.find((item) => item.id === s.selectedId) ?? s.items[0] ?? null;

      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        if (selected) {
          event.preventDefault();
          h.openMenuFor(selected);
        }
        return;
      }

      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        if (s.items.length === 0) return;
        const delta =
          event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const currentIndex = s.items.findIndex((item) => item.id === s.selectedId);
        const nextIndex =
          currentIndex < 0
            ? delta > 0
              ? 0
              : s.items.length - 1
            : Math.min(s.items.length - 1, Math.max(0, currentIndex + delta));
        const next = s.items[nextIndex];
        h.setSelected(next.id);
        window.requestAnimationFrame(() => {
          document
            .getElementById(`history-item-${next.id}`)
            ?.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
        return;
      }

      if (selected) {
        const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
        if (key === "T") {
          event.preventDefault();
          h.openMenuFor(selected);
          return;
        }
        if (key === "P") {
          event.preventDefault();
          h.togglePin(selected.id);
          return;
        }
        if (key === "M") {
          event.preventDefault();
          h.openPrivacy(selected.id, selected.isPrivate ? "disable" : "enable");
          return;
        }
        if (key === "Delete") {
          event.preventDefault();
          h.deleteItem(selected.id);
          return;
        }
        if (key === "Z" && selected.contentType === "image" && !selected.isPrivate) {
          event.preventDefault();
          h.zoomImage(selected);
          return;
        }
        if (key === "O" && selected.contentType === "image" && !selected.isPrivate) {
          event.preventDefault();
          h.openOcr(selected);
          return;
        }
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (!selected) return;
        h.setSelected(selected.id);
        h.copyItem(selected);
        return;
      }

      if (event.key === " ") {
        if (targetElement?.closest("button, a, [role='button'], [role='menuitem']")) return;
        event.preventDefault();
        if (!selected) return;
        h.setSelected(selected.id);
        h.toggleQueue(selected.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ────────────── Render ────────────── */

  const settingsIcon =
    settingsSaveState === "saving" ? RefreshCw : settingsSaveState === "saved" ? CheckSquare : Settings2;

  return (
    <div className="demo-surface">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
              {copy.eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">{copy.desc}</p>
          </div>
          <p className="text-xs text-gray-400">{copy.panelNote}</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-400">{copy.hintLabel}</span>
          <HintChip
            label={copy.hints.search}
            onClick={() => {
              setActiveView("all");
              setScope("all");
              setActiveTags([]);
              setSearchOpen(true);
              setSearch("tag:code");
            }}
          />
          <HintChip
            label={copy.hints.image}
            onClick={() => {
              setActiveView("image");
              setScope("image");
              setActiveTags([]);
            }}
          />
          <HintChip
            label={copy.hints.tags}
            onClick={() => {
              setActiveView("tag-selector");
              setTagSelectorOpen(true);
              setScope("all");
            }}
          />
          <HintChip
            label={copy.hints.wordCard}
            onClick={() => {
              setActiveView("tag:Word");
              setScope("all");
              setSearch("");
              setActiveTags(["Word"]);
              setTagSelectorOpen(false);
            }}
          />
          <HintChip
            label={copy.hints.regex}
            onClick={() => {
              setActiveView("all");
              setScope("all");
              setSearch("");
              setTagSelectorOpen(false);
              setActiveTags(["issue"]);
              const issue = items.find((item) =>
                Object.keys(item.metadata).some((key) => key.startsWith("tagMatch:")),
              );
              if (issue) {
                setSelectedId(issue.id);
                const [group] = collectTagMatches(issue);
                if (group) setMatchPanel({ item: issue, group });
              }
            }}
          />
          <HintChip
            label={copy.hints.queue}
            onClick={() => {
              const candidate = currentPageItems.find((item) => !item.isPrivate) ?? items[0];
              if (candidate) toggleQueue(candidate.id);
            }}
          />
          <button
            type="button"
            onClick={resetDemo}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            {copy.hints.reset}
          </button>
        </div>

        <div className="demo-desktop overflow-x-auto rounded-2xl border border-gray-300 p-3 shadow-sm sm:p-4">
          {/* The panel is a desktop window. On phones the whole mock desktop
              scrolls sideways instead of squeezing the header and cards into a
              width they were never designed for. */}
          <div className="min-w-[980px]">
            {/* The previous window: where clicks and drops land. */}
          <div className="mb-3 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-200 bg-slate-50 px-3 py-2">
              <span className="flex items-center gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-600">
                {copy.targetTitle}
              </span>
              <span className="shrink-0 text-[11px] text-gray-400">{copy.targetSubtitle}</span>
            </div>
            <div
              className={`eacp-scroll h-24 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed text-gray-700 ${
                targetFlash ? "demo-target-flash" : ""
              }`}
            >
              {!target ? (
                <span className="text-gray-400">{copy.targetEmpty}</span>
              ) : target.kind === "text" ? (
                <pre className="m-0 whitespace-pre-wrap break-words">{target.value}</pre>
              ) : target.kind === "file" ? (
                <ul className="m-0 space-y-1">
                  {target.values.map((value) => (
                    <li key={value} className="truncate">
                      {value}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3">
                  <img src={target.value} alt="" className="h-12 w-20 rounded border border-gray-200 object-cover" />
                  <span className="text-gray-500">
                    {copy.targetImage}
                    {target.width && target.height ? ` · ${target.width} × ${target.height}` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* The floating panel itself. */}
          <div className="relative overflow-hidden rounded-xl border border-gray-300 bg-slate-50 text-gray-900 shadow-[0_24px_60px_rgba(15,23,42,0.20)]">
            <header className={navBar}>
              <button
                type="button"
                className={`h-9 w-9 ${iconButton} cursor-move`}
                title={tr(locale, "dragWindow")}
                aria-label={tr(locale, "dragWindow")}
                onClick={() => notify(UI[lang].panelNote)}
              >
                <GripHorizontal className="h-4 w-4" aria-hidden />
              </button>

              <button
                type="button"
                className={`h-9 w-9 ${alwaysOnTop ? iconButtonActive : iconButton}`}
                title={alwaysOnTop ? tr(locale, "unpinWindow") : tr(locale, "pinWindow")}
                aria-label={alwaysOnTop ? tr(locale, "unpinWindow") : tr(locale, "pinWindow")}
                aria-pressed={alwaysOnTop}
                onClick={() => {
                  setAlwaysOnTop((prev) => !prev);
                  notify(alwaysOnTop ? UI[lang].pinOff : UI[lang].pinOn);
                }}
              >
                <Pin className="h-4 w-4" aria-hidden />
              </button>

              <div className="flex items-center">
                <button
                  type="button"
                  className={`h-9 w-9 ${iconButton}`}
                  title={tr(locale, "search")}
                  aria-label={tr(locale, "search")}
                  aria-expanded={searchOpen}
                  onClick={() => {
                    const next = !searchOpen;
                    setSearchOpen(next);
                    if (!next) setSearch("");
                  }}
                >
                  <Search className="h-4 w-4" aria-hidden />
                </button>
                <div
                  className={`overflow-hidden p-1.5 transition-all duration-200 ease-out ${
                    searchOpen ? "ml-0.5 w-[18.75rem] opacity-100" : "w-0 p-0 opacity-0"
                  }`}
                >
                  <input
                    autoFocus={searchOpen}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder='Search… tag:work app:chrome type:text "exact phrase"'
                    aria-label={tr(locale, "search")}
                    className={`h-9 ${input}`}
                  />
                </div>
              </div>

              <button
                type="button"
                className={`h-9 w-9 ${iconButton}`}
                onClick={() => {
                  document.getElementById("demo-filter-scroll")?.scrollBy({ left: -220, behavior: "smooth" });
                }}
                aria-label={tr(locale, "scrollTabsLeft")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>

              <div
                id="demo-filter-scroll"
                className="eacp-scroll-none -m-2 flex flex-1 items-center gap-1 overflow-x-auto p-2"
              >
                {tabs.map(({ key, label, icon: Icon, color }) => {
                  const active = key === "tag-selector" ? tagSelectorOpen : activeView === key;
                  const TabIcon = key === "settings" ? settingsIcon : Icon;
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
                          style={{ backgroundColor: color ?? (active ? "#1d4ed8" : "#9ca3af") }}
                          aria-hidden
                        />
                        <span>{label}</span>
                        <TabIcon
                          className={`h-4 w-4 ${
                            key === "settings" && settingsSaveState === "saving" ? "animate-spin" : ""
                          }`}
                          aria-hidden
                        />
                        {active && (
                          <span className="absolute -bottom-2 left-2 right-2 h-0.5 rounded-full bg-blue-600" aria-hidden />
                        )}
                      </button>

                      {key === "tag-selector" && tagSelectorOpen && (
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
                                  onClick={() => toggleActiveTag(tag.name)}
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
                onClick={() => {
                  document.getElementById("demo-filter-scroll")?.scrollBy({ left: 220, behavior: "smooth" });
                }}
                aria-label={tr(locale, "scrollTabsRight")}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </header>

            {toast && (
              <div
                role="status"
                className="eacp-animate-slide mx-4 mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700"
              >
                <Info className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{toast}</span>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label={tr(locale, "close")}
                  className={`inline-flex shrink-0 items-center justify-center rounded-lg p-1 transition-all duration-200 ease-out hover:bg-blue-100 active:scale-[0.98] ${focusRing}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}

            <main
              className={
                activeView === "settings" || activeView === "tag-manager"
                  ? "eacp-scroll h-[360px] overflow-y-auto px-4 py-4"
                  : "flex h-[360px] flex-col overflow-hidden px-4 py-4"
              }
            >
              <div className={activeView === "settings" ? "" : "hidden"}>
                <SettingsModal
                  ref={settingsRef}
                  locale={locale}
                  onStartTutorial={() => notify(UI[lang].tutorial)}
                  onSaved={handleSettingsSaved}
                />
              </div>

              <div className={activeView === "tag-manager" ? "" : "hidden"}>
                <TagManagementPage
                  tags={tags}
                  tagCounts={tagCountMap}
                  busy={false}
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
                  {currentPageItems.length === 0 ? (
                    <EmptyState
                      locale={locale}
                      filtered={hasFilters && items.length > 0}
                      onClear={hasFilters ? clearFilters : undefined}
                    />
                  ) : (
                    <div
                      id="demo-card-scroll"
                      className={`eacp-scroll flex h-full gap-4 overflow-x-auto overflow-y-hidden p-3 ${transition} ${
                        stripDropActive ? "!bg-blue-50 ring-2 ring-blue-500" : ""
                      }`}
                      onDragOver={(event) => {
                        if (!matchDragging) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        if (!stripDropActive) setStripDropActive(true);
                      }}
                      onDragLeave={() => setStripDropActive(false)}
                      onDrop={handleStripDrop}
                    >
                      {currentPageItems.map((item, index) => (
                        <ClipboardCard
                          key={item.id}
                          item={item}
                          actions={cardActions}
                          tagColors={tagColorMap}
                          isSelected={selectedId === item.id}
                          quickSlot={quickSlotIndex(0, hasFilters, index)}
                          queueSlot={queueOrderFor(item.id)}
                          locale={locale}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </main>
          </div>

          <p className="mt-3 text-center text-[11px] text-gray-400">
            {lang === "zh"
              ? "示例数据 · 所有操作只发生在浏览器里"
              : "Sample data · every action stays in your browser"}
          </p>
          <p className="mt-1 text-center text-[11px] text-gray-400 sm:hidden">
            {lang === "zh"
              ? "← 左右滑动查看完整面板 →"
              : "← Swipe sideways to explore the full panel →"}
          </p>
          </div>
        </div>
      </div>

      {cardMenu && menuItem && (
        <CardContextMenu
          key={menuItem.id}
          item={menuItem}
          anchor={{ x: cardMenu.x, y: cardMenu.y }}
          availableTags={assignableTags}
          locale={locale}
          isCopied={copiedId === menuItem.id}
          ocrBusy={false}
          ocrEnabled
          apiTranslateEnabled
          zoomShortcut="Z"
          onClose={() => setCardMenu(null)}
          onPaste={pasteItem}
          onCopy={copyItem}
          onTogglePin={togglePin}
          onDelete={deleteItem}
          onToggleTag={toggleTag}
          onCreateTag={createTag}
          onEnablePrivacy={(id) => openPrivacy(id, "enable")}
          onDisablePrivacy={(id) => openPrivacy(id, "disable")}
          onQuickEdit={openQuickEdit}
          onOcrOpen={openOcr}
          onZoom={zoomImage}
          onNotify={notify}
        />
      )}

      {ocrPanel && (
        <OcrResultModal
          key={ocrPanel.item.id}
          item={ocrPanel.item}
          locale={locale}
          initialText={ocrPanel.text}
          apiTranslateEnabled
          onClose={() => setOcrPanel(null)}
          onCopyText={(text) => {
            if (navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => {});
            notify(copy.copied);
          }}
          onPasteText={(text) => {
            showTarget({ kind: "text", value: text });
            notify(copy.pasted);
          }}
          onSavedAsItem={(newId) => {
            const text = ocrPanel.text;
            const item: HistoryItem = {
              id: newId,
              contentType: "text",
              content: text,
              createdAt: new Date().toISOString(),
              lastUsedAt: new Date().toISOString(),
              useCount: 1,
              pinned: false,
              isPrivate: false,
              tags: [],
              metadata: {
                length: [text.length.toString()],
                sourceApp: ["EasyCPTrans OCR"],
                appName: ["EasyCPTrans"],
              },
            };
            setItems((prev) => sortDemoItems([...prev, item]));
            setSelectedId(newId);
            setOcrPanel(null);
            notify(copy.ocrSaved);
          }}
          onNotify={notify}
        />
      )}

      {lightbox && (
        <ImageLightbox
          key={lightbox.item.id}
          item={lightbox.item}
          src={lightbox.src}
          locale={locale}
          onClose={() => setLightbox(null)}
          onCopy={copyItem}
          onPaste={pasteItem}
        />
      )}

      {matchPanel && (
        <MatchPanel
          item={matchPanel.item}
          group={matchPanel.group}
          tagColors={tagColorMap}
          locale={locale}
          onClose={() => setMatchPanel(null)}
          onMatchDragStart={cardActions.onMatchDragStart}
          onMatchDragEnd={cardActions.onMatchDragEnd}
          onCreateCard={createCardFromText}
        />
      )}

      {privacyAction && (
        <PasswordPromptModal
          title={privacyAction.mode === "enable" ? copy.privacyEnableTitle : copy.privacyDisableTitle}
          description={
            privacyAction.mode === "enable" ? copy.privacyEnableDesc : copy.privacyDisableDesc
          }
          confirmText={copy.privacyConfirm}
          onClose={() => setPrivacyAction(null)}
          onConfirm={confirmPrivacy}
        />
      )}

      {quickEdit && (
        <div
          className={overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setQuickEdit(null);
          }}
        >
          <div className={`${modalPanel} flex w-full max-w-2xl flex-col`}>
            <header className="flex items-center gap-3 border-b border-gray-200 p-4">
              <h2 className="flex-1 text-lg font-semibold tracking-tight text-gray-900">
                {copy.editTitle}
              </h2>
              <button
                type="button"
                className={`${iconButton} h-8 w-8`}
                onClick={() => setQuickEdit(null)}
                aria-label={copy.editCancel}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>
            <div className="p-4">
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                placeholder={copy.editPlaceholder}
                className={`${input} min-h-[240px] font-mono`}
              />
            </div>
            <footer className="flex justify-end gap-2 border-t border-gray-200 p-4">
              <button type="button" className={buttonSecondary} onClick={() => setQuickEdit(null)}>
                {copy.editCancel}
              </button>
              <button type="button" className={buttonPrimary} onClick={saveQuickEdit}>
                {copy.editSave}
              </button>
            </footer>
          </div>
        </div>
      )}

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-[100]"
          style={{ left: dragGhost.x - 148, top: dragGhost.y - 34 }}
        >
          {dragGhost.src ? (
            <img
              src={dragGhost.src}
              alt=""
              className="h-16 w-[296px] rounded-xl shadow-[0_18px_40px_rgba(15,23,42,0.35)]"
            />
          ) : (
            <div className={`flex h-16 w-[296px] items-center gap-3 rounded-xl bg-white px-3 shadow-[0_18px_40px_rgba(15,23,42,0.35)] ${surfaceInteractive}`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                {dragGhost.item.contentType === "file" ? (
                  <Files className="h-5 w-5" aria-hidden />
                ) : (
                  <FileImage className="h-5 w-5" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900">
                  {dragGhost.item.metadata?.appName?.[0] ?? "EasyCPTrans"}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {dragGhost.item.contentType === "file"
                    ? dragGhost.item.content.split(/\r?\n/).length + " files"
                    : `${dragGhost.item.metadata?.width?.[0] ?? "?"} × ${dragGhost.item.metadata?.height?.[0] ?? "?"}`}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HintChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-700"
    >
      {label}
    </button>
  );
}
