import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Copy, Maximize2, MousePointerClick, X, ZoomIn, ZoomOut } from "lucide-react";
import { tr, type Locale } from "../lib/i18n";
import type { HistoryItem } from "../types";
import { iconButton, modalPanel, overlay } from "./ui";

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const STEP = 1.25;
/** Arrow-key panning: a nudge, or a fine nudge with Shift. */
const PAN_STEP = 40;
const PAN_STEP_FINE = 8;

interface Props {
  item: HistoryItem;
  src: string;
  locale: Locale;
  onClose: () => void;
  onCopy: (item: HistoryItem) => void;
  onPaste: (item: HistoryItem) => void;
}

/**
 * Full-size image viewer: wheel or buttons to zoom, drag to pan, plus the same
 * copy/paste actions the card offers so the enlarged view is not a dead end.
 */
export function ImageLightbox({ item, src, locale, onClose, onCopy, onPaste }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const width = item.metadata?.width?.[0];
  const height = item.metadata?.height?.[0];

  const zoomTo = useCallback(
    (next: number, origin?: { x: number; y: number }) => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      if (clamped <= 1) {
        setScale(clamped);
        setOffset({ x: 0, y: 0 });
        return;
      }
      if (origin) {
        // Keep the point under the cursor pinned while the scale changes.
        const ratio = clamped / scale;
        setOffset({
          x: origin.x - (origin.x - offset.x) * ratio,
          y: origin.y - (origin.y - offset.y) * ratio,
        });
      }
      setScale(clamped);
    },
    [offset.x, offset.y, scale],
  );

  // React's `onWheel` is registered passively, so the listener goes on directly
  // in order to be able to preventDefault the panel scroll.
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const origin = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
      const factor = event.deltaY < 0 ? STEP : 1 / STEP;
      zoomTo(scale * factor, origin);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [scale, zoomTo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomTo(scale * STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomTo(scale / STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        setScale(1);
        setOffset({ x: 0, y: 0 });
      } else if (event.key.startsWith("Arrow")) {
        // Panning only means anything once the image is larger than the stage.
        if (scale <= 1) return;
        const step = event.shiftKey ? PAN_STEP_FINE : PAN_STEP;
        const delta = {
          ArrowLeft: step,
          ArrowRight: -step,
          ArrowUp: step,
          ArrowDown: -step,
        }[event.key];
        if (delta === undefined) return;
        event.preventDefault();
        const movable = event.key === "ArrowLeft" || event.key === "ArrowRight";
        setOffset((current) => ({
          x: current.x + (movable ? delta : 0),
          y: current.y + (movable ? 0 : delta),
        }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, scale, zoomTo]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    panRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    setOffset({ x: pan.ox + (event.clientX - pan.x), y: pan.oy + (event.clientY - pan.y) });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      className={`${overlay} z-[80]`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${modalPanel} flex max-h-[calc(100vh-24px)] w-full max-w-5xl flex-col`}>
        <header className="flex items-center gap-3 border-b border-gray-200 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold tracking-tight text-gray-900">
              {item.metadata?.sourceApp?.[0] || "EasyCPTrans"}
            </h2>
            <p className="truncate text-xs text-gray-500">
              {width && height ? `${width} × ${height}` : tr(locale, "imagePreview")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className={`${iconButton} h-9 w-9`}
              onClick={() => zoomTo(scale / STEP)}
              title={tr(locale, "zoomOut")}
              aria-label={tr(locale, "zoomOut")}
            >
              <ZoomOut className="h-4 w-4" aria-hidden />
            </button>
            <span className="w-12 text-center text-xs font-medium tabular-nums text-gray-600">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              className={`${iconButton} h-9 w-9`}
              onClick={() => zoomTo(scale * STEP)}
              title={tr(locale, "zoomIn")}
              aria-label={tr(locale, "zoomIn")}
            >
              <ZoomIn className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className={`${iconButton} h-9 w-9`}
              onClick={reset}
              title={tr(locale, "fitToWindow")}
              aria-label={tr(locale, "fitToWindow")}
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className={`${iconButton} h-9 w-9`}
              onClick={() => onCopy(item)}
              title={tr(locale, "copyImage")}
              aria-label={tr(locale, "copyImage")}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className={`${iconButton} h-9 w-9`}
              onClick={() => {
                onClose();
                onPaste(item);
              }}
              title={tr(locale, "paste")}
              aria-label={tr(locale, "paste")}
            >
              <MousePointerClick className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className={`${iconButton} h-9 w-9`}
              onClick={onClose}
              title={tr(locale, "close")}
              aria-label={tr(locale, "close")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div
          ref={stageRef}
          className={`flex min-h-[240px] flex-1 items-center justify-center overflow-hidden bg-gray-50 p-4 ${
            panning ? "cursor-grabbing" : scale > 1 ? "cursor-grab" : "cursor-default"
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={() => (scale === 1 ? zoomTo(2) : reset())}
        >
          <img
            className="max-h-full max-w-full object-contain select-none"
            src={src}
            alt={item.metadata?.sourceApp?.[0] || "Clipboard image"}
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          />
        </div>

        <p className="border-t border-gray-200 px-4 py-2.5 text-center text-xs text-gray-500">
          {tr(locale, "lightboxHint")}
        </p>
      </div>
    </div>
  );
}
