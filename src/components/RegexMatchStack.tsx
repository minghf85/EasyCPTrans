import { useState, type DragEvent as ReactDragEvent } from "react";
import { ChevronDown, GripVertical, Layers2, Plus, X } from "lucide-react";
import { tr, type Locale } from "../lib/i18n";
import type { TagMatchGroup } from "../lib/tagMatches";
import type { HistoryItem } from "../types";
import { focusRing, iconButton, inset, modalPanel, overlay, surface, surfaceInteractive } from "./ui";

/** Rows shown inside a card before the rest move to the overflow panel. */
const INLINE_LIMIT = 8;

/**
 * Custom drag payload. The plain-text fallback rides along so a match dropped
 * on the search box, or handed to another application, still arrives as text.
 */
export const MATCH_DRAG_MIME = "application/x-eacptrans-text";

interface StackProps {
  groups: TagMatchGroup[];
  tagColors: Record<string, string>;
  locale: Locale;
  onMatchDragStart: (value: string, event: ReactDragEvent) => void;
  onMatchDragEnd: () => void;
  onOpenPanel: (group: TagMatchGroup) => void;
}

/**
 * The extracted matches of a regex rule, collapsed into a stack.
 *
 * Clicking unfolds the values inside the card; each value can be dragged onto
 * the strip to become a card of its own. Rules that matched more than fits
 * inline defer to the overflow panel.
 */
export function MatchStack({
  groups,
  tagColors,
  locale,
  onMatchDragStart,
  onMatchDragEnd,
  onOpenPanel,
}: StackProps) {
  const [openTag, setOpenTag] = useState<string | null>(null);

  if (groups.length === 0) return null;

  return (
    <div
      // Bounded and scrollable on its own: with several groups, or one expanded
      // long list, the stack used to push the card body out of the card and get
      // cut off by its `overflow-hidden`. `.eacp-scroll` also keeps the wheel
      // here instead of letting the strip take it.
      className="eacp-scroll mb-3 max-h-[45%] shrink-0 space-y-2 overflow-y-auto pr-0.5"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {groups.map((group) => {
        const open = openTag === group.tag;
        const color = tagColors[group.tag.toLowerCase()];
        const visible = group.values.slice(0, INLINE_LIMIT);
        const hidden = group.values.length - visible.length;

        return (
          <div key={group.tag}>
            <button
              type="button"
              onClick={() => setOpenTag(open ? null : group.tag)}
              aria-expanded={open}
              title={tr(locale, "matchStackHint")}
              className={`group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition duration-200 ease-out hover:border-gray-300 hover:bg-gray-50 ${focusRing}`}
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white"
                aria-hidden
              >
                <Layers2 className="h-4 w-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-sm font-semibold tracking-tight"
                  style={color ? { color } : undefined}
                >
                  #{group.tag}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {group.total} {tr(locale, "matchCount")}
                  {group.total > group.values.length ? ` · ${tr(locale, "matchCapped")}` : ""}
                </span>
              </span>

              <ChevronDown
                className={`h-4 w-4 shrink-0 text-gray-400 transition-all duration-200 ease-out ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {open && (
              <div className={`mt-2 space-y-2 p-2 ${inset}`}>
                {visible.map((value, index) => (
                  <div
                    key={`${value}-${index}`}
                    draggable
                    onDragStart={(event) => onMatchDragStart(value, event)}
                    onDragEnd={onMatchDragEnd}
                    // No double-click here: the row is a drag source, and a drag
                    // swallows the second click. `onCreateCard` is on the button in
                    // the overflow panel instead.
                    title={tr(locale, "matchDragHint")}
                    className="flex cursor-grab items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 transition duration-200 ease-out hover:border-blue-300 hover:bg-blue-50 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{value}</span>
                  </div>
                ))}

                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenPanel(group)}
                    className={`w-full rounded px-1 py-1 text-left text-xs font-medium text-blue-600 transition-all duration-200 ease-out hover:text-blue-700 ${focusRing}`}
                  >
                    {hidden} {tr(locale, "matchMore")}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PanelProps {
  item: HistoryItem;
  group: TagMatchGroup;
  tagColors: Record<string, string>;
  locale: Locale;
  onClose: () => void;
  onMatchDragStart: (value: string, event: ReactDragEvent) => void;
  onMatchDragEnd: () => void;
  onCreateCard: (value: string) => void;
}

/** Every match of one rule, for when the list outgrows the card. */
export function MatchPanel({
  item,
  group,
  tagColors,
  locale,
  onClose,
  onMatchDragStart,
  onMatchDragEnd,
  onCreateCard,
}: PanelProps) {
  const color = tagColors[group.tag.toLowerCase()];

  return (
    <div
      className={`${overlay} z-[75]`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${modalPanel} flex max-h-[min(560px,calc(100vh-32px))] w-full max-w-xl flex-col`}>
        <header className="flex items-center gap-3 border-b border-gray-200 p-4">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"
            aria-hidden
          >
            <Layers2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-sm font-semibold tracking-tight text-gray-900"
              style={color ? { color } : undefined}
            >
              #{group.tag}
            </h2>
            <p className="truncate text-xs text-gray-500">
              {group.total} {tr(locale, "matchCount")} ·{" "}
              {item.metadata?.sourceApp?.[0] || "EasyCPTrans"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr(locale, "close")} className={`${iconButton} h-8 w-8`}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="eacp-scroll flex-1 space-y-2 overflow-y-auto p-4">
          {group.values.map((value, index) => (
            <div
              key={`${value}-${index}`}
              draggable
              onDragStart={(event) => onMatchDragStart(value, event)}
              onDragEnd={onMatchDragEnd}
              title={tr(locale, "matchDragHint")}
              className={`flex cursor-grab items-center gap-2 px-3 py-2 active:cursor-grabbing ${surface} ${surfaceInteractive}`}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{value}</span>
              <button
                type="button"
                onClick={() => onCreateCard(value)}
                title={tr(locale, "matchCreateCard")}
                className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 transition-all duration-200 ease-out hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98] ${focusRing}`}
              >
                <Plus className="h-3 w-3" aria-hidden />
                {tr(locale, "card")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Shared by both surfaces so a dragged match always carries the same payload. */
export function writeMatchDragData(value: string, event: ReactDragEvent) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(MATCH_DRAG_MIME, value);
  event.dataTransfer.setData("text/plain", value);
}
