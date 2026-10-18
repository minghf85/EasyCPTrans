import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Keyboard,
  MousePointerClick,
  X,
} from "lucide-react";
import { tr, type Locale } from "../lib/i18n";
import { isCardControlTarget } from "../lib/cardInteraction";
import { exceedsDragThreshold } from "../lib/dragGesture";
import {
  buildTutorialSteps,
  isRequirementMet,
  type TutorialContext,
  type TutorialStep,
} from "../lib/tutorial";
import {
  placeTooltip,
  sameRect,
  type TourRect,
  type TourViewport,
} from "../lib/tutorialPlacement";
import { buttonGhost, buttonPrimary, buttonSecondary, iconButtonQuiet, inset, modalPanel } from "./ui";

interface Props {
  open: boolean;
  locale: Locale;
  context: TutorialContext;
  /** Live state the tour can wait on. */
  signals: { menuOpen: boolean; queuedCount: number };
  onClose: () => void;
  /** Called before moving away from a step, so the step can undo its own view. */
  onLeaveStep?: (stepId: string) => void;
  /** Performs the real queue action for the "try it" button. */
  onQueueDemo: () => void;
}

/** How long the "done" state stays visible before the tour moves on. */
const AUTO_ADVANCE_MS = 650;

function paddedRect(rect: TourRect | null): TourRect | null {
  if (!rect) return null;
  return {
    left: rect.left - 6,
    top: rect.top - 6,
    width: rect.width + 12,
    height: rect.height + 12,
  };
}

function Backdrop({ rect, blockTarget }: { rect: TourRect | null; blockTarget: boolean }) {
  if (!rect) {
    return <div className="pointer-events-auto absolute inset-0 bg-gray-900/60" />;
  }

  const panels = [
    { left: 0, top: 0, right: 0, height: Math.max(0, rect.top) },
    { left: 0, top: rect.top + rect.height, right: 0, bottom: 0 },
    { left: 0, top: rect.top, width: Math.max(0, rect.left), height: rect.height },
    { left: rect.left + rect.width, top: rect.top, right: 0, height: rect.height },
  ];

  return (
    <>
      {panels.map((style, index) => (
        <div
          key={index}
          className="pointer-events-auto absolute bg-gray-900/60"
          style={style}
        />
      ))}
      {/* A non-interactive step still shows the control, but nothing inside the
          spotlight can be clicked: a left click on a card pastes and would end
          the tour without the user reading it. */}
      {blockTarget && (
        <div
          className="pointer-events-auto absolute"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
    </>
  );
}

export function TutorialOverlay({
  open,
  locale,
  context,
  signals,
  onClose,
  onLeaveStep,
  onQueueDemo,
}: Props) {
  const [index, setIndex] = useState(0);
  const [rawRect, setRawRect] = useState<TourRect | null>(null);
  const [view, setView] = useState<TourViewport>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [tooltipSize, setTooltipSize] = useState({ width: 380, height: 240 });
  const [clicked, setClicked] = useState(false);
  const [typed, setTyped] = useState(false);
  const [dragged, setDragged] = useState(false);
  const [clipboardTick, setClipboardTick] = useState(0);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const baselineRef = useRef({ clipboard: 0, queue: 0 });

  const shortcutKey = JSON.stringify(context.shortcuts);
  const steps = useMemo(
    () => buildTutorialSteps(context),
    // Rebuilding is cheap; the scalar deps keep parent re-renders from remaking
    // the step array (and therefore remaking every step object identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context.hasItems, context.hasDraggable, shortcutKey],
  );
  const step: TutorialStep = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  const liveRef = useRef({ clipboard: 0, queue: 0 });
  liveRef.current = { clipboard: clipboardTick, queue: signals.queuedCount };

  // A fresh run always starts at the top; closing and replaying from Settings
  // goes through this same transition.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Baselines are taken when a step starts: "a copy happened" means one more
  // than at the start, not "there is at least one item".
  useEffect(() => {
    if (!open) return;
    baselineRef.current = {
      clipboard: liveRef.current.clipboard,
      queue: liveRef.current.queue,
    };
    setClicked(false);
    setTyped(false);
    setDragged(false);
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const unlisten = listen("clipboard-changed", () => setClipboardTick((tick) => tick + 1));
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [open]);

  // Targets are live elements: they can mount a frame later (the card strip
  // after the first copy) or move (a menu flipping sides). Sampling beats
  // measuring once, and the interval is slow enough to stay invisible.
  useEffect(() => {
    if (!open) return;

    const update = () => {
      const nextView = { width: window.innerWidth, height: window.innerHeight };
      setView((prev) =>
        prev.width === nextView.width && prev.height === nextView.height ? prev : nextView,
      );

      const element = step.target
        ? (document.querySelector(step.target) as HTMLElement | null)
        : null;
      if (!element) {
        setRawRect((prev) => (prev === null ? prev : null));
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        setRawRect((prev) => (prev === null ? prev : null));
        return;
      }
      const next = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      setRawRect((prev) => (sameRect(prev, next) ? prev : next));
    };

    update();
    const timer = window.setInterval(update, 300);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, index, step.target]);

  // A step can point at a tab that the horizontally scrolling header has pushed
  // out of view (many pinned tags do this). Bring it back once, on entry, rather
  // than scrolling on every sample — that would fight the user.
  useEffect(() => {
    if (!open || !step.target) return;
    const element = document.querySelector(step.target);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth &&
      rect.bottom <= window.innerHeight;
    if (!visible) element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, index, step.target]);

  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setTooltipSize((prev) =>
      Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
        ? prev
        : { width: rect.width, height: rect.height },
    );
  }, [open, index, locale, rawRect]);

  const highlightRect = useMemo(() => paddedRect(rawRect), [rawRect]);
  const placement = useMemo(
    () => placeTooltip(highlightRect, tooltipSize, view, step.placement ?? "bottom"),
    [highlightRect, tooltipSize, view, step.placement],
  );

  const required = Boolean(step.require);
  const met =
    required &&
    isRequirementMet(step, {
      clicked,
      typed,
      dragged,
      menuOpen: signals.menuOpen,
      queueDelta: signals.queuedCount - baselineRef.current.queue,
      clipboardDelta: clipboardTick - baselineRef.current.clipboard,
    });

  const goNext = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    onLeaveStep?.(step.id);
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [isLast, onClose, onLeaveStep, step.id, steps.length]);

  const goBack = useCallback(() => {
    if (index === 0) return;
    onLeaveStep?.(step.id);
    setIndex((current) => Math.max(0, current - 1));
  }, [index, onLeaveStep, step.id]);

  useEffect(() => {
    if (!open || !met) return;
    const timer = window.setTimeout(goNext, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, met, goNext]);

  // Interaction probes run on the real UI. Capture phase means the app's own
  // handlers still run; the tour only observes.
  useEffect(() => {
    if (!open) return;
    const selector = step.requireSelector ?? step.target;

    const onClick = (event: Event) => {
      if (step.require !== "click" || !selector) return;
      const target = event.target as Element | null;
      if (target?.closest(selector)) setClicked(true);
    };
    const onInput = (event: Event) => {
      if (step.require !== "input" || !selector) return;
      const target = event.target as Element | null;
      if (!target?.closest(selector)) return;
      const value = (target as HTMLInputElement).value ?? "";
      setTyped(value.trim().length > 0);
    };
    // A left click on the card would paste and hide the panel; the step wants
    // the context menu, so only the secondary button is allowed through.
    const onPointerDown = (event: PointerEvent) => {
      if (!step.blockLeftClick || event.button !== 0 || !selector) return;
      const target = event.target as Element | null;
      if (!target?.closest(selector)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, step]);

  // Drag steps are only offered on file/image cards (text drag-out is not
  // supported). This observes the real card gesture: the app starts its native
  // OLE drag at the same threshold, so the user gets genuine feedback while the
  // tour only watches for the movement.
  useEffect(() => {
    if (!open || step.require !== "drag") return;
    const selector = step.requireSelector ?? step.target;
    if (!selector) return;
    let stop: (() => void) | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      // A control inside the card owns its press; the card gesture ignores it,
      // so the tour must not count it as a drag either.
      if (isCardControlTarget(event.target)) return;
      const target = event.target as Element | null;
      if (!target?.closest(selector)) return;
      const origin = { x: event.clientX, y: event.clientY };
      const pointerId = event.pointerId;

      function detach() {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", detach, true);
        window.removeEventListener("pointercancel", detach, true);
        if (stop === detach) stop = null;
      }

      function onMove(move: PointerEvent) {
        if (move.pointerId !== pointerId) return;
        if (!exceedsDragThreshold(origin, { x: move.clientX, y: move.clientY })) return;
        detach();
        setDragged(true);
      }

      stop = detach;
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", detach, true);
      window.addEventListener("pointercancel", detach, true);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      stop?.();
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      // The card shortcuts are already suppressed while the tour is open; this
      // keeps Tab inside the card as well, so the backdrop behaves like a modal.
      if (event.key !== "Tab") return;
      const container = tooltipRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !container.contains(active)) {
        event.preventDefault();
        focusable[0].focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (active === container) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // The typing step should leave the caret where the user has to type; every
    // other step focuses the card so screen readers announce it.
    if (step.require === "input" && step.target) {
      const field = document.querySelector(step.target) as HTMLElement | null;
      field?.focus({ preventScroll: true });
      return;
    }
    tooltipRef.current?.focus({ preventScroll: true });
  }, [open, index, step.require, step.target]);

  if (!open) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <Backdrop rect={highlightRect} blockTarget={!step.interactive} />

      {highlightRect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-blue-400"
          style={{
            left: highlightRect.left,
            top: highlightRect.top,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
          aria-hidden
        />
      )}

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-step-title"
        tabIndex={-1}
        className={`eacp-scroll pointer-events-auto fixed max-h-[calc(100vh-24px)] w-[380px] max-w-[calc(100vw-24px)] overflow-y-auto p-4 ${modalPanel} focus:outline-none`}
        style={{ left: placement.left, top: placement.top }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Compass className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-500">{tr(locale, "tutorialTitle")}</p>
            <p className="text-[11px] tabular-nums text-gray-400">
              {index + 1} / {steps.length}
            </p>
          </div>
          <button
            type="button"
            className={`h-8 w-8 ${iconButtonQuiet}`}
            onClick={onClose}
            aria-label={tr(locale, "tutorialSkip")}
            title={tr(locale, "tutorialSkip")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-100" aria-hidden>
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-200 ease-out"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        <h2
          id="tutorial-step-title"
          className="mt-4 text-base font-semibold tracking-tight text-gray-900"
        >
          {tr(locale, step.titleKey)}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{tr(locale, step.bodyKey)}</p>

        {step.keyList && (
          <ul className={`mt-3 space-y-1.5 p-2.5 ${inset}`}>
            {step.keyList.map((entry) => (
              <li
                key={`${entry.combo}-${entry.labelKey}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <kbd className="shrink-0 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
                  {entry.combo}
                </kbd>
                <span className="text-right text-gray-600">{tr(locale, entry.labelKey)}</span>
              </li>
            ))}
          </ul>
        )}

        {step.require && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              met ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
            }`}
            role="status"
          >
            {met ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <span>
              {met
                ? tr(locale, "tutorialInteractiveDone")
                : tr(locale, step.requireHintKey ?? "tutorialInteractive")}
            </span>
          </div>
        )}

        {step.demo === "queue" && (
          <button
            type="button"
            className={`mt-3 w-full ${buttonSecondary}`}
            onClick={onQueueDemo}
          >
            <Keyboard className="h-4 w-4" aria-hidden />
            {tr(locale, "tutorialQueueDemo")}
          </button>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className={buttonGhost}
            onClick={goBack}
            disabled={index === 0}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {tr(locale, "tutorialBack")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonGhost}
              onClick={onClose}
            >
              {tr(locale, "tutorialSkip")}
            </button>
            <button type="button" className={buttonPrimary} onClick={goNext}>
              {isLast ? tr(locale, "tutorialFinish") : tr(locale, "tutorialNext")}
              {isLast ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
