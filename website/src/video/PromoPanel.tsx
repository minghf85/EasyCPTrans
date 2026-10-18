/**
 * The promo's replica of the main window.
 *
 * This is deliberately not a simplified shell: it uses the real navigation
 * tokens, the real memory chip, and the real `ClipboardCard`, so the nav bar,
 * the card strip, the metadata row, and the card body all behave like the
 * shipping app. The scripted interactions in the film drive the same DOM the
 * app drives — scroll containers are scrolled, and the card gets the same tilt
 * transform `useCardTilt` produces.
 */

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileImage,
  FileText,
  Files,
  GripHorizontal,
  Monitor,
  Pin,
  Search,
  Settings2,
  Square,
  Star,
  Tags as TagsIcon,
} from "lucide-react";

import { ClipboardCard, type CardActions } from "../../../src/components/ClipboardCard";
import { MemoryChip } from "../../../src/components/MemoryChip";
import {
  focusRing,
  iconButton,
  iconButtonActive,
  input,
  navBar,
  surface,
  surfaceInteractive,
  transition,
} from "../../../src/components/ui";
import type { HistoryItem } from "../../../src/types";
import { DEMO_TAGS } from "../demo/data";

const TAG_COLORS: Record<string, string> = Object.fromEntries(
  DEMO_TAGS.map((tag) => [tag.name.toLowerCase(), tag.color ?? "#0f6cbd"]),
);

const CARD_ACTIONS: CardActions = {
  onPaste: () => {},
  onDisablePrivacy: () => {},
  onOcrOpen: () => {},
  onOpenImage: () => {},
  onDragOutStart: async () => {},
  onMatchDragStart: () => {},
  onMatchDragEnd: () => {},
  onOpenMatchPanel: () => {},
  onContextMenu: () => {},
  onHover: () => {},
};

interface TabDef {
  key: string;
  label: string;
  icon: typeof FileText;
  color?: string;
}

/** Mirrors `tabList` in `App.tsx`, including the tags that make the bar scroll. */
const TABS: TabDef[] = [
  { key: "all", label: "All", icon: FileText, color: "#1d4ed8" },
  { key: "text", label: "Text", icon: FileText, color: "#0f6cbd" },
  { key: "image", label: "Image", icon: FileImage, color: "#107c10" },
  { key: "file", label: "File", icon: Files, color: "#7b4f9d" },
  { key: "pinned", label: "Pinned", icon: Star, color: "#d83b01" },
  { key: "device", label: "#Office-PC", icon: Monitor, color: "#8764b8" },
  { key: "word", label: "#Word", icon: TagsIcon, color: "#0067c0" },
  { key: "work", label: "#work", icon: TagsIcon, color: "#0f6cbd" },
  { key: "code", label: "#code", icon: TagsIcon, color: "#0b6a0b" },
  { key: "design", label: "#design", icon: TagsIcon, color: "#c239b3" },
  { key: "todo", label: "#todo", icon: TagsIcon, color: "#ca5010" },
  { key: "links", label: "#links", icon: TagsIcon, color: "#038387" },
  { key: "tags", label: "Tags", icon: TagsIcon, color: "#1d4ed8" },
  { key: "tag-manager", label: "Tag Admin", icon: TagsIcon, color: "#1d4ed8" },
  { key: "settings", label: "Settings", icon: Settings2, color: "#1d4ed8" },
];

const SELECTABLE_TAGS = [
  "work",
  "code",
  "design",
  "todo",
  "links",
  "issue",
  "Office-PC",
  "Word",
] as const;

export interface PromoPanelProps {
  t: number;
  items: HistoryItem[];
  width: number;
  height: number;
  style?: CSSProperties;
  className?: string;
  /** Scene-driven state. */
  selectedId?: number;
  queue?: Record<number, number>;
  activeTab?: string;
  searchOpen?: boolean;
  search?: ReactNode;
  tagSelectorOpen?: boolean;
  activeTags?: string[];
  pinned?: boolean;
  /** Horizontal positions, 0–1, for the two scrollable strips. */
  tabScroll?: number;
  cardStripScroll?: number;
  /** Card interaction scripts. */
  contentScroll?: { index: number; value: number };
  metadataScroll?: { index?: number; value: number };
  tilt?: { index: number; x: number; y: number } | null;
  /** Opens the real MatchStack inside a card at this scene-local time. */
  openMatchStackAt?: number;
  cardRevealAt?: number;
  cardStagger?: number;
  showPageNav?: boolean;
}

export function PromoPanel({
  t,
  items,
  width,
  height,
  style,
  className,
  selectedId,
  queue = {},
  activeTab = "all",
  searchOpen = false,
  search,
  tagSelectorOpen = false,
  activeTags = [],
  pinned = false,
  tabScroll,
  cardStripScroll,
  contentScroll,
  metadataScroll,
  tilt,
  openMatchStackAt,
  cardRevealAt,
  cardStagger = 0.12,
  showPageNav = false,
}: PromoPanelProps) {
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const cardStripRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const matchOpenedRef = useRef(false);

  const tagMap = useMemo(
    () =>
      Object.fromEntries(
        DEMO_TAGS.map((tag) => [tag.name.toLowerCase(), tag]),
      ) as Record<string, { color?: string }>,
    [],
  );

  // Drive the real DOM: scroll the same containers the app scrolls, and apply
  // the same transform the tilt hook applies when the pointer moves.
  useEffect(() => {
    if (tabStripRef.current && tabScroll !== undefined) {
      const element = tabStripRef.current;
      element.scrollLeft = tabScroll * (element.scrollWidth - element.clientWidth);
    }

    if (cardStripRef.current) {
      const element = cardStripRef.current;
      const target =
        cardStripScroll === undefined ? element.scrollLeft : cardStripScroll * (element.scrollWidth - element.clientWidth);
      element.scrollLeft = target;
    }

    cardRefs.current.forEach((wrapper, index) => {
      const article = wrapper?.querySelector<HTMLElement>("article");
      if (!article) return;

      if (tilt && tilt.index === index) {
        const rotateX = (tilt.y - 0.5) * -16;
        const rotateY = (tilt.x - 0.5) * 16;
        article.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
      } else {
        article.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)";
      }

      if (contentScroll && contentScroll.index === index) {
        const body = article.querySelector<HTMLElement>(".eacp-scroll.min-h-0.flex-1");
        if (body) {
          const max = Math.max(0, body.scrollHeight - body.clientHeight);
          body.scrollTop = contentScroll.value * max;
        }
      }

      if (metadataScroll && (metadataScroll.index === undefined || metadataScroll.index === index)) {
        const row = article.querySelector<HTMLElement>(".eacp-scroll-none");
        if (row) {
          const max = Math.max(0, row.scrollWidth - row.clientWidth);
          row.scrollLeft = metadataScroll.value * max;
        }
      }
    });

    if (openMatchStackAt !== undefined && t >= openMatchStackAt && !matchOpenedRef.current) {
      const first = cardRefs.current.find((wrapper) => wrapper);
      const article = first?.querySelector<HTMLElement>("article");
      const toggle = article?.querySelector<HTMLButtonElement>("button[aria-expanded]");
      if (toggle) {
        toggle.click();
        matchOpenedRef.current = true;
      }
    }
    if (openMatchStackAt !== undefined && t < openMatchStackAt && matchOpenedRef.current) {
      const first = cardRefs.current.find((wrapper) => wrapper);
      const article = first?.querySelector<HTMLElement>("article");
      const toggle = article?.querySelector<HTMLButtonElement>("button[aria-expanded]");
      if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
      matchOpenedRef.current = false;
    }
  }, [
    t,
    tabScroll,
    cardStripScroll,
    contentScroll,
    metadataScroll,
    tilt,
    openMatchStackAt,
  ]);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-300 bg-slate-50 text-gray-900 shadow-[0_24px_60px_rgba(15,23,42,0.20)] ${className ?? ""}`}
      style={{ width, height, ...style }}
    >
      <div className="flex h-full flex-col">
        <header className={navBar}>
          <button type="button" className={`h-9 w-9 ${iconButton} cursor-move`} aria-label="拖动窗口">
            <GripHorizontal className="h-4 w-4" aria-hidden />
          </button>

          <button
            type="button"
            className={`h-9 w-9 ${pinned ? iconButtonActive : iconButton}`}
            aria-label={pinned ? "取消置顶" : "窗口置顶"}
            aria-pressed={pinned}
          >
            <Pin className="h-4 w-4" aria-hidden />
          </button>

          <div className="flex items-center">
            <button type="button" className={`h-9 w-9 ${iconButton}`} aria-label="搜索">
              <Search className="h-4 w-4" aria-hidden />
            </button>
            <div
              className={`overflow-hidden p-1.5 ${transition} ${
                searchOpen ? "ml-0.5 w-[18.75rem] opacity-100" : "w-0 p-0 opacity-0"
              }`}
            >
              <div className={`flex h-9 items-center gap-2 px-3 ${input}`}>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {search ?? <span className="text-gray-400">Search… tag:work app:chrome type:text</span>}
                </span>
              </div>
            </div>
          </div>

          <button type="button" className={`h-9 w-9 ${iconButton}`} aria-label="向左滚动标签栏">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>

          <div
            ref={tabStripRef}
            className="eacp-scroll-none -m-2 flex flex-1 items-center gap-1 overflow-x-auto p-2"
          >
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              const Icon = tab.icon;
              return (
                <span key={tab.key} className="contents">
                  <button
                    type="button"
                    aria-pressed={active}
                    className={`relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium ${transition} ${focusRing} ${
                      active ? "text-blue-700" : "text-gray-500"
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tab.color ?? (active ? "#1d4ed8" : "#9ca3af") }}
                      aria-hidden
                    />
                    <span>{tab.label}</span>
                    <Icon className="h-4 w-4" aria-hidden />
                    {active && (
                      <span className="absolute -bottom-2 left-2 right-2 h-0.5 rounded-full bg-blue-600" aria-hidden />
                    )}
                  </button>

                  {tab.key === "tags" && tagSelectorOpen && (
                    <div className="eacp-scroll flex shrink-0 items-center gap-2 overflow-x-auto rounded-lg bg-gray-50 px-2 py-1.5">
                      {SELECTABLE_TAGS.map((name) => {
                        const activeTag = activeTags.includes(name);
                        const color = tagMap[name.toLowerCase()]?.color ?? "#2563eb";
                        return (
                          <span
                            key={name}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${
                              activeTag ? "" : "border-gray-200 bg-white text-gray-600"
                            }`}
                            style={
                              activeTag
                                ? {
                                    borderColor: `${color}66`,
                                    backgroundColor: `${color}14`,
                                    color,
                                  }
                                : undefined
                            }
                          >
                            {activeTag ? (
                              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm" style={{ color }}>
                                <CheckSquare className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                            <span>#{name}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </span>
              );
            })}
          </div>

          <button type="button" className={`h-9 w-9 ${iconButton}`} aria-label="向右滚动标签栏">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>

          <MemoryChip locale="zh-CN" onOpenSettings={() => {}} />
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
          <div
            ref={cardStripRef}
            className="eacp-scroll flex h-full gap-4 overflow-x-auto overflow-y-hidden p-3"
          >
            {items.map((item, index) => {
              const p = cardRevealAt === undefined ? 1 : easeOut(progress(t, cardRevealAt + index * cardStagger, 0.55));
              return (
                <div
                  key={item.id}
                  ref={(node) => {
                    cardRefs.current[index] = node;
                  }}
                  className="h-full shrink-0"
                  style={{
                    opacity: p,
                    transform: `translate3d(0, ${(1 - p) * 26}px, 0)`,
                  }}
                >
                  <ClipboardCard
                    item={item}
                    actions={CARD_ACTIONS}
                    tagColors={TAG_COLORS}
                    isSelected={item.id === selectedId}
                    quickSlot={index + 1}
                    queueSlot={queue[item.id] ?? null}
                    locale="zh-CN"
                  />
                </div>
              );
            })}

            {showPageNav && (
              <div
                className={`flex h-full w-[260px] shrink-0 flex-col items-center justify-center gap-2 text-gray-500 ${surface} ${surfaceInteractive}`}
              >
                <Ellipsis className="h-8 w-8" aria-hidden />
                <span className="text-sm font-medium">加载下一页</span>
                <small className="text-xs text-gray-400">51-100</small>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Kept tiny and pure so scenes can reuse the same reveal easing. */
function progress(time: number, start: number, duration: number): number {
  return Math.min(1, Math.max(0, (time - start) / duration));
}

function easeOut(value: number): number {
  return 1 - (1 - value) ** 3;
}
