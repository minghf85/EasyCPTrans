import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type WheelEvent,
} from "react";
import {
  Clock3,
  EyeOff,
  FileCode,
  FileImage,
  FileText,
  Files,
  Image as ImageIcon,
  Pin,
  ScanText,
  Tag,
} from "lucide-react";
import { formatExactTime, formatTime } from "../lib/time";
import { api } from "../lib/api";
import { fetchImageDataUrl, forgetImage } from "../lib/imageCache";
import { fetchAppIcon, getCachedAppIcon } from "../lib/appIcons";
import { brandColorFor, headerBandColor, prewarmBrandColor } from "../lib/brandColor";
import {
  isCardControlTarget,
  isRepeatClick,
  resolveCardClick,
  type ClickStamp,
} from "../lib/cardInteraction";
import {
  cachedDragChip,
  describeDragChip,
  warmDragChip,
  type DragChipBitmap,
} from "../lib/dragChip";
import { fileBasename, fileKindFor, fileParentDir } from "../lib/fileIcons";
import { collectTagMatches, type TagMatchGroup } from "../lib/tagMatches";
import { tr, normalizeLocale, type Locale } from "../lib/i18n";
import { useCardGesture, type CardGesturePhase } from "../hooks/useCardGesture";
import { useCardTilt } from "../hooks/useCardTilt";
import { prewarmImageDrop } from "../lib/dropStage";
import type { HistoryItem } from "../types";
import { MatchStack } from "./RegexMatchStack";
import { focusRing, inset, transition } from "./ui";

function formatBytes(bytes: number, decimals = 1) {
  if (!+bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const base = 1024;
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(base)));
  return `${parseFloat((bytes / Math.pow(base, index)).toFixed(decimals))} ${units[index]}`;
}

function detectLabel(item: HistoryItem) {
  if (item.contentType === "image") return "Image";
  if (item.contentType === "file") return "File";
  const language = item.metadata?.language?.[0];
  if (language) return language;
  if (/<\/?[a-z][^>]*>/i.test(item.content)) return "HTML";
  if (/\b(function|const|let|class|import|export|return)\b/.test(item.content)) return "Code";
  return "Text";
}

function isCodeLike(item: HistoryItem) {
  return (
    item.contentType === "text" &&
    !!(
      item.metadata?.language?.[0] ||
      /<\/?[a-z][^>]*>/i.test(item.content) ||
      /\b(function|const|let|class|import|export|return|using|namespace|public|private)\b/.test(item.content)
    )
  );
}

function sourceApp(item: HistoryItem) {
  return item.metadata?.sourceApp?.[0] || item.metadata?.appName?.[0] || "EasyCPTrans";
}

/**
 * Seed for the monogram fallback. The executable name is more stable than the
 * window title, which changes with every document.
 */
function sourceAppSeed(item: HistoryItem) {
  return item.metadata?.appName?.[0] || sourceApp(item);
}


function monogramLetter(seed: string) {
  const trimmed = seed.trim().replace(/^\.+/, "");
  return (trimmed.charAt(0) || "?").toUpperCase();
}

/** Icon shown inside the content-type badge in the meta strip. */
function typeBadgeIcon(item: HistoryItem, codeLike: boolean) {
  if (item.contentType === "image") return FileImage;
  if (item.contentType === "file") return Files;
  if (codeLike) return FileCode;
  return FileText;
}

function isDeviceTag(item: HistoryItem, tag: string) {
  return item.metadata?.deviceName?.some((name) => name.trim().toLowerCase() === tag.trim().toLowerCase()) ?? false;
}

function isRedundantMetaTag(item: HistoryItem, tag: string) {
  const normalized = tag.trim().toLowerCase();
  if (["text", "image", "file"].includes(normalized)) {
    return normalized === item.contentType;
  }
  if (normalized === "pinned") return item.pinned;
  if (normalized === "private" || normalized === "privacy") return item.isPrivate;
  return false;
}

function translationStatus(item: HistoryItem) {
  return item.metadata?.translationStatus?.[0] || null;
}

function translationQuery(item: HistoryItem) {
  return item.metadata?.wordQuery?.[0] || null;
}

function renderTranslationRichText(content: string) {
  const lines = content.replace(/\\n/g, "\n").split(/\r?\n/);
  const nodes: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {listItems.map((line, index) => (
          <li key={`${line}-${index}`}>{line}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line === "---") {
      flushList();
      nodes.push(<hr key={`divider-${index}`} className="my-3 border-gray-200" />);
      return;
    }
    if (line.startsWith("# ")) {
      flushList();
      nodes.push(
        <p key={`title-${index}`} className="text-lg font-semibold tracking-tight text-gray-900">
          {line.slice(2)}
        </p>,
      );
      return;
    }
    if (line.startsWith("## ")) {
      flushList();
      nodes.push(
        <p key={`section-${index}`} className="mt-3 text-sm font-semibold text-gray-900">
          {line.slice(3)}
        </p>,
      );
      return;
    }
    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      return;
    }
    flushList();
    if (line.startsWith("🏷 ")) {
      nodes.push(
        <div key={`badges-${index}`} className="my-1 flex flex-wrap gap-1.5">
          {line
            .slice(3)
            .split(" · ")
            .map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
              >
                {badge}
              </span>
            ))}
        </div>,
      );
      return;
    }
    if (line.startsWith("🔊 ")) {
      nodes.push(
        <p key={`phonetic-${index}`} className="font-mono text-xs text-gray-500">
          {line}
        </p>,
      );
      return;
    }
    if (line.startsWith("source:") || line.startsWith("query:")) {
      nodes.push(
        <p key={`source-${index}`} className="text-xs text-gray-400">
          {line}
        </p>,
      );
      return;
    }
    nodes.push(<p key={`p-${index}`}>{line}</p>);
  });

  flushList();
  return nodes.length ? nodes : content;
}

/**
 * Everything a card can ask the application to do.
 *
 * One object rather than a dozen callbacks: the card is a memoised component, so
 * a callback that changes identity on every render of `App` re-renders all fifty
 * cards. `App` keeps the identity of this object stable and refreshes its
 * members in place, which is why **members must be read at call time**
 * (`actions.onPaste(...)`, never `const { onPaste } = actions`): a card that does
 * not re-render would otherwise keep calling the handler it captured last time.
 */
export interface CardActions {
  onPaste: (item: HistoryItem) => void;
  /** Opens the unlock prompt for an encrypted item. */
  onDisablePrivacy: (id: number) => void;
  /** Recognizes the image (or opens the existing result) in the review panel. */
  onOcrOpen: (item: HistoryItem) => void;
  /** Opens the enlarged image viewer. */
  onOpenImage: (item: HistoryItem, src: string) => void;
  /**
   * Hands the card to the native drag loop so it can be dropped into another
   * app. Resolves when the drop does, which is how the card knows to stop
   * showing itself as being carried.
   */
  onDragOutStart: (item: HistoryItem, preview: DragChipBitmap | null) => Promise<void>;
  onMatchDragStart: (value: string, event: ReactDragEvent) => void;
  onMatchDragEnd: () => void;
  onOpenMatchPanel: (item: HistoryItem, group: TagMatchGroup) => void;
  /** Reports a right click, so the actions menu can be opened at the pointer. */
  onContextMenu: (item: HistoryItem, anchor: { x: number; y: number }) => void;
  /** Reports a hover, so the parent can track the current card. */
  onHover: (item: HistoryItem) => void;
}

interface Props {
  item: HistoryItem;
  actions: CardActions;
  tagColors?: Record<string, string>;
  isSelected?: boolean;
  quickSlot?: number | null;
  queueSlot?: number | null;
  locale?: Locale;
}

export const ClipboardCard = memo(function ClipboardCard({
  item,
  actions,
  tagColors = {},
  isSelected = false,
  quickSlot = null,
  queueSlot = null,
  locale,
}: Props) {
  const [imageSrc, setImageSrc] = useState(
    item.contentType === "image" ? item.content || null : null,
  );
  const appPath = item.metadata?.appPath?.[0] ?? "";
  const [appIconSrc, setAppIconSrc] = useState<string | null>(
    appPath ? getCachedAppIcon(appPath) ?? null : null,
  );
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const imageRequestedRef = useRef(false);
  const { cardRef: tiltRef, updateTilt, resetTilt } = useCardTilt();

  // The source application's colour: read from its icon, with a stable fallback
  // so the first paint is never blank.
  const brandSeed = sourceAppSeed(item);
  const brandKey = appPath || brandSeed;
  const [brandColor, setBrandColor] = useState(() => brandColorFor(brandKey, brandSeed));

  // Two lines of attribution: the process that owns the content, and the window
  // it came from. The process name is the stable one — window titles change with
  // every tab — so it leads, and the title follows as context.
  const appName = item.metadata?.appName?.[0] ?? "";
  const windowTitle = item.metadata?.sourceApp?.[0] ?? "";
  const primarySource = appName || windowTitle || "EasyCPTrans";
  const secondarySource = appName && windowTitle && windowTitle !== appName ? windowTitle : "";
  /** What the band spells out on hover: the program, the window, and its path. */
  const sourceDetail = [primarySource, windowTitle, appPath].filter(Boolean).join("\n");

  const chipDescription = useMemo(() => describeDragChip(item), [item]);
  /** The band colour: the brand colour, darkened enough for white text. */
  const bandColor = useMemo(() => headerBandColor(brandColor), [brandColor]);
  /** What the drag image should look like. Rendering it is the expensive part. */
  const chipPayload = useMemo(
    () => ({
      source: primarySource,
      detail: chipDescription.detail,
      kind: chipDescription.kind,
      color: brandColor,
      iconSrc: appIconSrc,
    }),
    [primarySource, chipDescription.detail, chipDescription.kind, brandColor, appIconSrc],
  );

  /**
   * Chips are rendered when the pointer arrives rather than when the card
   * mounts: a canvas pass per card is what made switching tags stutter, and a
   * drag can only start from a pointer that is already on the card.
   */
  const warmChip = () => {
    if (item.isPrivate) return;
    void warmDragChip(chipPayload);
  };
  const typeLabel = useMemo(() => detectLabel(item), [item]);
  const codeLike = useMemo(() => isCodeLike(item), [item]);
  const hasPrivacy = item.isPrivate;
  const chars = item.metadata?.length?.[0];
  const totalSize = item.metadata?.totalSize?.[0] ?? item.metadata?.size?.[0];
  const width = item.metadata?.width?.[0];
  const height = item.metadata?.height?.[0];
  const translationState = translationStatus(item);
  const translationWord = translationQuery(item);
  const ocrText = item.metadata?.ocrText?.[0] ?? "";
  const isTranslationItem = item.tags.includes("Word") || Boolean(translationState || translationWord);
  const displayTags = item.tags.filter((tag) => !isRedundantMetaTag(item, tag));
  const tagColorFor = (tag: string) => tagColors[tag.toLowerCase()];
  const matchGroups = useMemo(() => collectTagMatches(item), [item]);
  const TypeIcon = typeBadgeIcon(item, codeLike);
  // `locale` is optional on this component; the sub-components need a concrete
  // one, and `normalizeLocale` resolves to the same default the inline
  // fallbacks below already assume.
  const cardLocale = useMemo(() => normalizeLocale(locale), [locale]);

  useEffect(() => {
    if (!appPath) {
      setAppIconSrc(null);
      return;
    }
    const cached = getCachedAppIcon(appPath);
    if (cached !== undefined) {
      setAppIconSrc(cached);
      return;
    }
    let cancelled = false;
    void fetchAppIcon(appPath).then((url) => {
      if (!cancelled) setAppIconSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [appPath]);

  // The brand colour is read out of the icon, so it lands one tick after the
  // icon does; the bar starts on the stable fallback and swaps in when it does.
  useEffect(() => {
    if (!appIconSrc) return;
    let cancelled = false;
    void prewarmBrandColor(appPath, appIconSrc).then((colour) => {
      if (colour && !cancelled) setBrandColor(colour);
    });
    return () => {
      cancelled = true;
    };
  }, [appPath, appIconSrc]);

  useEffect(() => {
    if (item.contentType !== "image" || hasPrivacy) return;
    const node = imageContainerRef.current;
    if (!node) return;

    // Track visibility continuously: load when the card enters view, unload
    // when it leaves so off-screen images don't accumulate in memory.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!imageRequestedRef.current) {
              imageRequestedRef.current = true;
              void fetchImageDataUrl(item.id, api.getImageContent)
                .then((dataUrl) => {
                  setImageSrc(dataUrl);
                  prewarmImageDrop(item);
                })
                .catch(() => setImageSrc(""));
            }
          } else if (imageSrc) {
            // Card scrolled out of view: release the image data so the GC can
            // reclaim the base64 bytes. The cache entry is also dropped so a
            // future scroll-back re-fetches fresh data.
            setImageSrc(null);
            forgetImage(item.id);
            imageRequestedRef.current = false;
          }
        }
      },
      { root: null, threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.contentType, item.id, hasPrivacy, imageSrc]);

  /** Stops a wheel event from being hijacked into horizontal strip scrolling. */
  const stopOuterScroll = (event: WheelEvent<HTMLElement>, axis: "x" | "y") => {
    const node = event.currentTarget;
    const delta = axis === "x" ? (event.deltaY !== 0 ? event.deltaY : event.deltaX) : event.deltaY;
    if (delta === 0) return;

    if (axis === "x") {
      const maxScroll = node.scrollWidth - node.clientWidth;
      if (maxScroll <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      node.scrollLeft = Math.max(0, Math.min(maxScroll, node.scrollLeft + delta));
      return;
    }

    const maxScroll = node.scrollHeight - node.clientHeight;
    if (maxScroll <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    node.scrollTop = Math.max(0, Math.min(maxScroll, node.scrollTop + delta));
  };

  const lastTapRef = useRef<ClickStamp | null>(null);

  /**
   * A press that stays put activates the card. The decision itself lives in
   * `resolveCardClick` so the whole table of cases is unit tested; this handler
   * only carries it out.
   */
  const handleCardTap = ({ target }: { target: EventTarget | null }) => {
    const now = Date.now();
    const action = resolveCardClick({
      contentType: item.contentType,
      isPrivate: hasPrivacy,
      // The gesture already skips controls; checking again keeps the tap honest
      // if that filter is ever bypassed.
      isControlTarget: isCardControlTarget(target),
      isRepeatClick: isRepeatClick(lastTapRef.current, item.id, now),
      hasTextSelection: !(window.getSelection()?.isCollapsed ?? true),
    });
    if (action === "none") return;
    lastTapRef.current = { itemId: item.id, at: now };

    if (action === "request-unlock") {
      // Ask for the password instead of letting the clipboard writer throw and
      // surface a red banner that reads as "this card is broken".
      actions.onDisablePrivacy(item.id);
      return;
    }
    actions.onPaste(item);
  };

  /**
   * The card is one gesture surface: a press that moves hands it to the native
   * Windows drag loop, a press that stays put activates it.
   */
  /**
   * The press animation. `pressed` means the pointer is down on the content
   * area, `dragging` means the card has been handed to the native loop and is
   * on its way somewhere else.
   */
  const [phase, setPhase] = useState<CardGesturePhase>("idle");
  const { onPointerDown: handleCardPointerDown } = useCardGesture({
    onPressChange: setPhase,
    onDragOut: () => {
      // A drag that never reports back — a stuck loop, a result the panel never
      // receives — must not leave the card dimmed for the rest of the session.
      const watchdog = window.setTimeout(() => setPhase("idle"), 60_000);
      void actions.onDragOutStart(item, cachedDragChip(chipPayload)).finally(() => {
        window.clearTimeout(watchdog);
        setPhase("idle");
      });
    },
    onTap: handleCardTap,
  });

  const phaseAnimation =
    phase === "dragging"
      ? "scale-[0.97] opacity-60 ring-2 ring-blue-400"
      : phase === "pressed"
        ? "scale-[0.985] shadow-md"
        : "";

  const renderBody = () => {
    if (item.contentType === "image") {
      return (
        <div
          ref={imageContainerRef}
          className="eacp-scroll min-h-0 flex-1 overflow-y-auto"
          onWheel={(event) => stopOuterScroll(event, "y")}
        >
          {hasPrivacy || imageSrc === null ? (
            <div className={`flex h-32 flex-col items-center justify-center gap-2 text-gray-400 ${inset}`}>
              <ImageIcon className="h-6 w-6" aria-hidden />
              <span className="text-xs">{hasPrivacy ? "Private image" : "Image"}</span>
            </div>
          ) : imageSrc === "" ? (
            <div className={`flex h-32 flex-col items-center justify-center gap-2 text-gray-400 ${inset}`}>
              <ImageIcon className="h-6 w-6" aria-hidden />
              <span className="text-xs">Image failed to load</span>
            </div>
          ) : (
            <img
              src={imageSrc}
              alt="Clipboard content"
              loading="lazy"
              decoding="async"
              draggable={false}
              className={`h-32 w-full rounded-lg object-cover ${inset}`}
            />
          )}
        </div>
      );
    }

    if (item.contentType === "file") {
      const files = item.content.split("\n").filter(Boolean);
      return (
        <div
          className="eacp-scroll min-h-0 flex-1 space-y-2 overflow-y-auto"
          onWheel={(event) => stopOuterScroll(event, "y")}
        >
          {files.map((file, index) => {
            const kind = fileKindFor(file);
            const KindIcon = kind.icon;
            const parent = fileParentDir(file);
            const size = item.metadata?.sizes?.[index];
            return (
              <div
                key={`${item.id}-${index}`}
                className={`group flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${transition} hover:bg-gray-50 ${
                  hasPrivacy ? "blur-[2px] select-none" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    title={kind.label}
                    style={{ backgroundColor: kind.from }}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                  >
                    <KindIcon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {fileBasename(file)}
                    </span>
                    {parent && (
                      <span className="block truncate text-xs text-gray-500" title={parent}>
                        {parent}
                      </span>
                    )}
                  </span>
                </div>
                {size && (
                  <span className="shrink-0 text-xs font-medium text-gray-500">
                    {formatBytes(parseInt(size, 10))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div
        className="eacp-scroll min-h-0 flex-1 overflow-y-auto"
        onWheel={(event) => stopOuterScroll(event, "y")}
      >
        {isTranslationItem ? (
          <div className={`space-y-2 p-3 text-sm leading-relaxed text-gray-700 ${inset}`}>
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-2">
              <span className="truncate font-semibold tracking-tight text-gray-900">
                {translationState === "pending"
                  ? `Translating ${translationWord || item.content || "…"}`
                  : translationWord || item.content || "Translation"}
              </span>
              <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {translationState === "pending" ? "Pending" : translationState === "error" ? "Error" : "Ready"}
              </span>
            </div>
            <div className={hasPrivacy ? "blur-[2px] select-none" : ""}>
              {translationState === "pending"
                ? item.content || "Translating…"
                : renderTranslationRichText(item.content || "Empty translation")}
            </div>
          </div>
        ) : codeLike ? (
          <pre
            className={`eacp-scroll m-0 overflow-x-auto p-3 font-mono text-xs leading-relaxed text-gray-800 ${
              hasPrivacy ? "blur-[2px] select-none" : ""
            } ${inset}`}
          >
            {item.content || "Empty text item"}
          </pre>
        ) : (
          <div
            className={`whitespace-pre-wrap break-words p-3 text-sm leading-relaxed text-gray-700 ${
              hasPrivacy ? "blur-[2px] select-none" : ""
            } ${inset}`}
          >
            {item.content || "Empty text item"}
          </div>
        )}
      </div>
    );
  };

  return (
    <article
      ref={tiltRef}
      id={`history-item-${item.id}`}
      data-card-id={item.id}
      // Programmatic focus target only, so the actions menu can hand focus back
      // without putting the card in the tab order.
      tabIndex={-1}
      onContextMenu={(event) => {
        event.preventDefault();
        actions.onContextMenu(item, { x: event.clientX, y: event.clientY });
      }}
      onMouseMove={updateTilt}
      onMouseLeave={() => {
        resetTilt();
      }}
      onMouseEnter={() => {
        actions.onHover(item);
      }}
      className={`flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-xl bg-white transition-all duration-200 ease-out will-change-transform focus:outline-none ${
        // Card shadow: vPaste-style deep drop shadow with subtle white inner border.
        // The inset white border creates a soft edge glow that makes the card feel
        // like it's floating above the surface.
        isSelected
          ? "shadow-[0_16px_40px_rgba(37,99,235,0.35),inset_0_0_0_2px_rgba(37,99,235,0.50)]"
          : "shadow-[0_12px_28px_rgba(0,0,0,0.12),inset_0_0_0_1px_rgba(255,255,255,0.55)] hover:shadow-[0_16px_34px_rgba(0,0,0,0.15),inset_0_0_0_1px_rgba(255,255,255,0.68)]"
      } ${phaseAnimation}`}
    >
      {/* Two layers, not one picture: the band carries the source colour and its
          name, and the icon sits on its own white plate that breaks past the
          band's lower edge. The plate and its shadow do the separating — there is
          no border anywhere, so there is no third edge to read. The band is also
          the only part of the card that knows where this came from, so hovering
          it names the full source. */}
      <header
        className="relative shrink-0 px-4 py-3 pl-[84px] shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_1px_10px_rgba(20,28,24,0.05)]"
        style={{ backgroundColor: bandColor }}
        title={sourceDetail}
      >
        <span className="absolute bottom-0 left-4 z-10 flex h-14 w-14 translate-y-1/3 items-center justify-center rounded-xl bg-white shadow-md">
          {appIconSrc ? (
            <img src={appIconSrc} alt="" draggable={false} className="h-10 w-10 object-contain" />
          ) : (
            <span className="text-lg font-semibold" style={{ color: bandColor }}>
              {monogramLetter(brandSeed)}
            </span>
          )}
        </span>
        <span className="block truncate text-sm font-semibold text-white">{primarySource}</span>
        <span className="block truncate text-[11px] leading-4 text-white/70">
          {secondarySource || typeLabel}
        </span>
      </header>

      {/* Content area: clean padding, depth comes from the card's overall shadow. */}
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-8">
        {/* The gesture surface, and only the content: press and hold to drag the
            card out, click to paste. The band above is a label and the row below
            is a status line, so neither of them acts on the card. */}
        <div
          className="flex min-h-0 flex-1 cursor-grab flex-col active:cursor-grabbing"
          onPointerDown={handleCardPointerDown}
          onPointerEnter={warmChip}
          title={locale ? tr(locale, "dragOutHint") : "Press and drag into another app"}
        >
          {queueSlot && (
          <span className="mb-2 inline-flex w-fit items-center rounded-lg bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
            Q{queueSlot}
          </span>
        )}

        <MatchStack
          groups={matchGroups}
          tagColors={tagColors}
          locale={cardLocale}
          onMatchDragStart={actions.onMatchDragStart}
          onMatchDragEnd={actions.onMatchDragEnd}
          onOpenPanel={(group) => actions.onOpenMatchPanel(item, group)}
        />

        {renderBody()}

        </div>

        <div
          // `pb-1 -mb-1`: room for the row's focus rings to spill below the scroll
          // container without moving the pills or the border above them.
          className="eacp-scroll-none mt-3 flex shrink-0 items-center gap-2 overflow-x-auto border-t border-gray-200 pt-3 pb-1 -mb-1"
          onWheel={(event) => stopOuterScroll(event, "x")}
        >
          {quickSlot && (
            <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              #{quickSlot}
            </span>
          )}

          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            <TypeIcon className="h-3 w-3" aria-hidden />
            {typeLabel}
          </span>

          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500" title={formatExactTime(item.lastUsedAt)}>
            <Clock3 className="h-3 w-3" aria-hidden />
            {formatTime(item.lastUsedAt)}
          </span>

          {chars && <span className="shrink-0 text-xs text-gray-500">{chars} chars</span>}
          {width && height && (
            <span className="shrink-0 text-xs text-gray-500">
              {width} × {height}
            </span>
          )}
          {totalSize && (
            <span className="shrink-0 text-xs text-gray-500">{formatBytes(parseInt(totalSize, 10))}</span>
          )}

          {ocrText && (
            <button
              type="button"
              title={ocrText.slice(0, 300)}
              onClick={() => actions.onOcrOpen(item)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium text-blue-600 transition-all duration-200 ease-out hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98] ${focusRing}`}
            >
              <ScanText className="h-3 w-3" aria-hidden />
              {ocrText.trim().length} {locale ? tr(locale, "ocrCharUnit") : "chars"}
            </button>
          )}

          {item.pinned && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Pin className="h-3 w-3" aria-hidden />
              Pinned
            </span>
          )}

          {hasPrivacy && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              <EyeOff className="h-3 w-3" aria-hidden />
              Private
            </span>
          )}

          {displayTags.map((tag) => {
            const color = tagColorFor(tag);
            return (
              <span
                key={tag}
                style={
                  color
                    ? { borderColor: `${color}40`, backgroundColor: `${color}12`, color }
                    : undefined
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium ${
                  color
                    ? ""
                    : isDeviceTag(item, tag)
                      ? "border-purple-200 bg-purple-50 text-purple-700"
                      : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                <Tag className="h-3 w-3" aria-hidden />
                #{tag}
              </span>
            );
          })}
        </div>
      </div>
    </article>
  );
});
