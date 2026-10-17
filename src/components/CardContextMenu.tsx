import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  EyeOff,
  Languages,
  Loader2,
  Maximize2,
  MousePointerClick,
  PenSquare,
  Pin,
  Plus,
  ScanText,
  Shield,
  Square,
  Trash2,
  CheckSquare,
} from "lucide-react";
import { api } from "../lib/api";
import { tr, type Locale } from "../lib/i18n";
import { getTagDisplayName } from "../lib/tagDisplay";
import { placeMenu, type MenuPlacement } from "../lib/menuPlacement";
import type { HistoryItem } from "../types";
import {
  buttonGhost,
  buttonPrimary,
  input,
  menuColumn,
  menuItem,
  menuItemDanger,
  menuSeparator,
  menuSurface,
} from "./ui";

/**
 * The actions for one card, as a context menu.
 *
 * Rendered through a portal onto `document.body` rather than inside the card:
 * cards carry `overflow-hidden` for their rounded corners, and the hover lift is
 * a `transform`, which would make the card the containing block for anything
 * positioned against the viewport. A popup that has to line up with the pointer
 * cannot live inside either of those.
 *
 * The Tag panel is a second column of the same popup instead of a nested
 * submenu: one measured box, one flip, one outside-click target. That is a small
 * deviation from the APG submenu pattern, which expects the submenu to be nested
 * inside its `menuitem`; the ARIA attributes it relies on (`aria-haspopup`,
 * `aria-expanded`, focus moving into the column) are all still there.
 */

interface Action {
  key: string;
  icon: ReactNode;
  label: string;
  /** Rendered on the right; the shortcut that does the same thing. */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Leaves the popup open, for actions that stack — tagging several times. */
  keepOpen?: boolean;
  run: () => void;
}

export interface CardContextMenuProps {
  item: HistoryItem;
  /** Where the pointer was, in viewport CSS pixels. */
  anchor: { x: number; y: number };
  availableTags: string[];
  locale: Locale;
  isCopied: boolean;
  ocrBusy: boolean;
  ocrEnabled: boolean;
  apiTranslateEnabled: boolean;
  /** The configured key that enlarges an image, shown beside the menu entry. */
  zoomShortcut: string;
  onClose: () => void;
  onPaste: (item: HistoryItem) => void;
  onCopy: (item: HistoryItem) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
  onToggleTag: (id: number, tag: string) => void;
  onCreateTag?: (id: number, tag: string) => Promise<void>;
  onEnablePrivacy: (id: number) => void;
  onDisablePrivacy: (id: number) => void;
  onQuickEdit: (item: HistoryItem) => void;
  onOcrOpen: (item: HistoryItem) => void;
  onZoom: (item: HistoryItem) => void;
  onNotify: (message: string) => void;
}

export function CardContextMenu(props: CardContextMenuProps) {
  const { item, anchor, availableTags, locale, onClose } = props;

  const [view, setView] = useState<"root" | "tags" | "translate">("root");
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [newTagError, setNewTagError] = useState("");
  const [newTagBusy, setNewTagBusy] = useState(false);
  const [customLang, setCustomLang] = useState("");

  const popupRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const tagItemRef = useRef<HTMLDivElement | null>(null);
  const translateItemRef = useRef<HTMLDivElement | null>(null);
  const newTagInputRef = useRef<HTMLInputElement | null>(null);

  const ocrText = item.metadata?.ocrText?.[0] ?? "";
  const hasPrivacy = item.isPrivate;
  const canTranslate =
    !hasPrivacy &&
    props.apiTranslateEnabled &&
    (item.contentType === "text" || (item.contentType === "image" && ocrText.length > 0));
  // For images, translate the OCR text rather than the (binary) content field.
  const translatableText = item.contentType === "image" ? ocrText : item.content;

  const activate = (action: Action) => {
    if (action.disabled) return;
    if (!action.keepOpen) onClose();
    action.run();
  };

  const groups: Action[][] = [
    [
      {
        key: "paste",
        icon: <MousePointerClick className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        label: tr(locale, "paste"),
        shortcut: "Enter",
        run: () => props.onPaste(item),
      },
      {
        key: "copy",
        icon: props.isCopied ? (
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ),
        label: tr(locale, "copy"),
        run: () => props.onCopy(item),
      },
    ],
    [
      {
        key: "pin",
        icon: <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        label: item.pinned ? tr(locale, "unpin") : tr(locale, "pin"),
        run: () => props.onTogglePin(item.id),
      },
      {
        key: "tag",
        icon: <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        label: tr(locale, "tags"),
        shortcut: "T",
        keepOpen: true,
        run: () => setView((current) => (current === "tags" ? "root" : "tags")),
      },
      {
        key: "privacy",
        icon: hasPrivacy ? (
          <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ),
        label: hasPrivacy ? tr(locale, "unlock") : tr(locale, "private"),
        run: () => (hasPrivacy ? props.onDisablePrivacy(item.id) : props.onEnablePrivacy(item.id)),
      },
    ],
    [
      ...(item.contentType === "text" && !hasPrivacy
        ? [
            {
              key: "edit",
              icon: <PenSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />,
              label: tr(locale, "edit"),
              run: () => props.onQuickEdit(item),
            },
          ]
        : []),
      ...(canTranslate
        ? [
            {
              key: "translate",
              icon: <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden />,
              label: tr(locale, "ocrTranslate"),
              shortcut: "▸",
              keepOpen: true,
              run: () => setView((current) => (current === "translate" ? "root" : "translate")),
            },
          ]
        : []),
      ...(item.contentType === "image" && !hasPrivacy
        ? [
            {
              key: "zoom",
              icon: <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
              label: tr(locale, "zoomIn"),
              shortcut: props.zoomShortcut,
              run: () => props.onZoom(item),
            },
          ]
        : []),
      ...(item.contentType === "image" && !hasPrivacy && (props.ocrEnabled || ocrText)
        ? [
            {
              key: "ocr",
              icon: props.ocrBusy ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              ) : (
                <ScanText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ),
              // With a result already stored, the action opens it rather than
              // recognizing again, and says so.
              label: ocrText ? tr(locale, "ocrText") : tr(locale, "ocr"),
              disabled: props.ocrBusy,
              run: () => props.onOcrOpen(item),
            },
          ]
        : []),
    ],
    [
      {
        key: "delete",
        icon: <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        label: tr(locale, "delete"),
        shortcut: "Del",
        danger: true,
        run: () => props.onDelete(item.id),
      },
    ],
  ].filter((group) => group.length > 0);

  /** Every actionable item in the popup, in visual order. */
  const focusableItems = () =>
    Array.from(
      popupRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]',
      ) ?? [],
    );

  // Measure after layout and re-measure whenever the popup changes size — the
  // Tag panel appearing is a size change like any other.
  useLayoutEffect(() => {
    const node = popupRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setPlacement(
      placeMenu(
        { x: anchor.x, y: anchor.y, width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor.x, anchor.y, view, availableTags.length, creatingTag, Boolean(newTagError), locale]);

  // Focus moves into the menu once it is actually visible, and goes back to the
  // card it belongs to. Gating on `placement` matters: a `visibility: hidden`
  // element cannot take focus, so the first item has to wait for the measurement
  // that reveals the popup — otherwise the keyboard never gets in and the menu's
  // own key handling never runs.
  const focusedOnceRef = useRef(false);
  useLayoutEffect(() => {
    if (!placement || focusedOnceRef.current) return;
    focusedOnceRef.current = true;
    focusableItems()[0]?.focus({ preventScroll: true });
  }, [placement]);

  useEffect(() => {
    const card = document.getElementById(`history-item-${item.id}`);
    return () => {
      card?.focus?.({ preventScroll: true });
    };
  }, [item.id]);

  useEffect(() => {
    if (creatingTag) newTagInputRef.current?.focus({ preventScroll: true });
  }, [creatingTag]);

  // Dismissals. A transparent backdrop is deliberately not used: it would eat
  // the wheel event, and scrolling the strip is one of the ways out.
  useEffect(() => {
    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && popupRef.current?.contains(target)) return;
      onClose();
    };
    const onAnyScrollOrWheel = (event: Event) => {
      const target = event.target as Node | null;
      if (target && popupRef.current?.contains(target)) return;
      onClose();
    };
    const onViewportChange = () => onClose();

    document.addEventListener("pointerdown", onPointerDownOutside, true);
    window.addEventListener("wheel", onAnyScrollOrWheel, { capture: true, passive: true });
    window.addEventListener("scroll", onAnyScrollOrWheel, { capture: true, passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("blur", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside, true);
      window.removeEventListener("wheel", onAnyScrollOrWheel, true);
      window.removeEventListener("scroll", onAnyScrollOrWheel, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("blur", onViewportChange);
    };
  }, [onClose]);

  const moveFocus = (delta: number) => {
    const items = focusableItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : (current + delta + items.length) % items.length;
    items[next]?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const inInput = target.tagName === "INPUT";

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (inInput && creatingTag) {
        // Escape backs out of the inline form first, then out of the menu.
        setCreatingTag(false);
        setNewTagValue("");
        setNewTagError("");
        return;
      }
      onClose();
      return;
    }

    if (inInput) {
      // The input handles its own Enter; everything else is the caret's.
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        void submitNewTag();
      }
      return;
    }

    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };

    switch (event.key) {
      case "ArrowDown":
        handled();
        moveFocus(1);
        return;
      case "ArrowUp":
        handled();
        moveFocus(-1);
        return;
      case "Home":
        handled();
        focusableItems()[0]?.focus({ preventScroll: true });
        return;
      case "End": {
        handled();
        const items = focusableItems();
        items[items.length - 1]?.focus({ preventScroll: true });
        return;
      }
      case "ArrowRight":
        if (document.activeElement === tagItemRef.current && view === "root") {
          handled();
          setView("tags");
        } else if (document.activeElement === translateItemRef.current && view === "root") {
          handled();
          setView("translate");
        }
        return;
      case "ArrowLeft":
        if (view === "tags") {
          handled();
          setView("root");
          tagItemRef.current?.focus({ preventScroll: true });
        } else if (view === "translate") {
          handled();
          setView("root");
          translateItemRef.current?.focus({ preventScroll: true });
        }
        return;
      case "Tab":
        // Closing on Tab is what the menu pattern asks for; the browser keeps
        // the default so focus moves on from wherever it lands.
        onClose();
        return;
      case "Enter":
      case " ": {
        handled();
        const active = document.activeElement as HTMLElement | null;
        if (active && popupRef.current?.contains(active)) active.click();
        return;
      }
      default:
        return;
    }
  };

  const submitNewTag = async () => {
    const value = newTagValue.trim();
    if (!value || newTagBusy || !props.onCreateTag) return;
    setNewTagBusy(true);
    setNewTagError("");
    try {
      await props.onCreateTag(item.id, value);
      setNewTagValue("");
      setCreatingTag(false);
    } catch (err) {
      setNewTagError(String(err));
    } finally {
      setNewTagBusy(false);
    }
  };

  const renderItem = (action: Action) => {
    const isTagAction = action.key === "tag";
    const isTranslateAction = action.key === "translate";
    return (
      <div
        key={action.key}
        ref={isTagAction ? tagItemRef : isTranslateAction ? translateItemRef : undefined}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup={isTagAction || isTranslateAction ? "menu" : undefined}
        aria-expanded={isTagAction ? view === "tags" : isTranslateAction ? view === "translate" : undefined}
        aria-disabled={action.disabled || undefined}
        onClick={() => activate(action)}
        className={`${action.danger ? menuItemDanger : menuItem} ${
          action.disabled ? "pointer-events-none opacity-50" : ""
        } ${isTagAction && view === "tags" ? "bg-gray-100" : ""} ${isTranslateAction && view === "translate" ? "bg-gray-100" : ""}`}
      >
        {action.icon}
        <span className="min-w-0 flex-1 truncate">{action.label}</span>
        {action.shortcut && (
          <span className="shrink-0 font-mono text-[10px] text-gray-400">{action.shortcut}</span>
        )}
      </div>
    );
  };

  const columns = `${menuColumn} w-56 space-y-0.5`;

  return createPortal(
    <div
      ref={popupRef}
      role="menu"
      aria-label={tr(locale, "itemMenu")}
      aria-orientation="vertical"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        left: placement?.left ?? anchor.x,
        top: placement?.top ?? anchor.y,
        ...(placement ? null : { visibility: "hidden" as const }),
      }}
      className={menuSurface}
    >
      <div ref={listRef} className={columns}>
        {groups.map((group, index) => (
          <div key={group[0].key} className="space-y-0.5">
            {index > 0 && <div role="separator" className={menuSeparator} />}
            {group.map(renderItem)}
          </div>
        ))}
      </div>

      {view === "tags" && (
        <div
          role="menu"
          aria-label={tr(locale, "tags")}
          className={`${columns} border-l border-gray-200 pl-2`}
        >
          {availableTags.length === 0 && !creatingTag ? (
            <p className="px-2 py-1.5 text-xs text-gray-500">{tr(locale, "noTags")}</p>
          ) : (
            availableTags.map((tag) => {
              const active = item.tags.includes(tag);
              return (
                <div
                  key={tag}
                  role="menuitemcheckbox"
                  aria-checked={active}
                  tabIndex={-1}
                  onClick={() => props.onToggleTag(item.id, tag)}
                  className={`${menuItem} ${active ? "bg-blue-50 text-blue-700" : ""}`}
                >
                  {active ? (
                    <CheckSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Square className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">#{getTagDisplayName(tag, locale)}</span>
                </div>
              );
            })
          )}

          {creatingTag ? (
            <div className="space-y-1.5 pt-1">
              <input
                ref={newTagInputRef}
                value={newTagValue}
                onChange={(event) => {
                  setNewTagValue(event.target.value);
                  setNewTagError("");
                }}
                placeholder={tr(locale, "newTag")}
                disabled={newTagBusy}
                aria-invalid={Boolean(newTagError)}
                className={`${input} px-2 py-1.5 text-xs ${
                  newTagError ? "border-red-500 focus:border-red-500 focus:ring-red-500/25" : ""
                }`}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submitNewTag()}
                  disabled={newTagBusy || !newTagValue.trim()}
                  className={`${buttonPrimary} px-2.5 py-1 text-xs`}
                >
                  {newTagBusy ? "…" : tr(locale, "addTag")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingTag(false);
                    setNewTagValue("");
                    setNewTagError("");
                  }}
                  disabled={newTagBusy}
                  className={`${buttonGhost} px-2 py-1 text-xs`}
                >
                  {tr(locale, "cancel")}
                </button>
              </div>
              {newTagError && (
                <p role="alert" className="text-xs text-red-600">
                  {newTagError}
                </p>
              )}
            </div>
          ) : (
            <div
              role="menuitem"
              tabIndex={-1}
              aria-disabled={props.onCreateTag ? undefined : true}
              onClick={() => {
                if (!props.onCreateTag) return;
                setCreatingTag(true);
                setNewTagError("");
              }}
              className={`${menuItem} ${props.onCreateTag ? "" : "pointer-events-none opacity-50"}`}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {tr(locale, "newTag")}
            </div>
          )}
        </div>
      )}

      {view === "translate" && (
        <div
          role="menu"
          aria-label={tr(locale, "translateTo")}
          className={`${columns} border-l border-gray-200 pl-2`}
        >
          <p className="px-2 py-1.5 text-xs font-medium text-gray-500">{tr(locale, "translateTo")}</p>
          {[
            { key: "langChinese" as const, value: "中文" },
            { key: "langEnglish" as const, value: "English" },
            { key: "langJapanese" as const, value: "日本語" },
            { key: "langKorean" as const, value: "한국어" },
            { key: "langFrench" as const, value: "Français" },
            { key: "langGerman" as const, value: "Deutsch" },
            { key: "langSpanish" as const, value: "Español" },
            { key: "langRussian" as const, value: "Русский" },
          ].map((lang) => (
            <div
              key={lang.key}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                void api
                  .translateTextApi(translatableText, lang.value)
                  .catch((err) => props.onNotify(String(err)));
                props.onClose();
              }}
              className={menuItem}
            >
              <Languages className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{tr(locale, lang.key)}</span>
            </div>
          ))}

          <div className="space-y-1.5 border-t border-gray-200 pt-2">
            <p className="px-2 text-xs font-medium text-gray-500">{tr(locale, "translateCustomLang")}</p>
            <div className="flex items-center gap-1.5 px-1">
              <input
                value={customLang}
                onChange={(event) => setCustomLang(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && customLang.trim()) {
                    void api
                      .translateTextApi(translatableText, customLang.trim())
                      .catch((err) => props.onNotify(String(err)));
                    props.onClose();
                  }
                }}
                placeholder={tr(locale, "translateCustomLangPlaceholder")}
                className={`${input} flex-1 px-2 py-1.5 text-xs`}
              />
              <button
                type="button"
                onClick={() => {
                  if (!customLang.trim()) return;
                  void api
                    .translateTextApi(translatableText, customLang.trim())
                    .catch((err) => props.onNotify(String(err)));
                  props.onClose();
                }}
                disabled={!customLang.trim()}
                className={`${buttonPrimary} shrink-0 px-2.5 py-1 text-xs`}
              >
                {tr(locale, "ocrTranslate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
