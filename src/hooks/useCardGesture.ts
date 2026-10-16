import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { isCardControlTarget } from "../lib/cardInteraction";
import { exceedsDragThreshold } from "../lib/dragGesture";

/**
 * The pointer gesture that covers a whole card.
 *
 * A card has exactly two outcomes for a left press, and the pointer decides
 * between them: staying put means "use this item" and moving past the threshold
 * means "take it somewhere". Both are handled here rather than by a `click`
 * handler, because the press is already being intercepted to stop the browser's
 * own drag and text selection — owning the release keeps the semantics in one
 * place instead of depending on how the engine treats a cancelled mousedown.
 *
 * The drag loop is entered through an async hop, so the threshold is also what
 * keeps a plain click from entering `DoDragDrop` after the button is released —
 * the drop would then resolve against whatever sits under the cursor, which is
 * usually the panel itself.
 *
 * Pointer listeners deliberately live on `window` instead of using
 * `setPointerCapture`: the mouse capture has to stay free for OLE to take it
 * when the drag starts.
 */
/**
 * What the pointer is currently doing on the card, so the card can show it.
 *
 * `pressed` is a press that has not moved yet; `dragging` is a press that has
 * crossed the threshold and handed the card to the native drag loop.
 */
export type CardGesturePhase = "idle" | "pressed" | "dragging";

export interface CardGestureHandlers {
  /** The press started, moved far enough to become a drag, or ended. */
  onPressChange?: (phase: CardGesturePhase) => void;
  /** The press moved past the threshold. */
  onDragOut: () => void;
  /** The press stayed put, so this was an activation. */
  onTap: (event: { target: EventTarget | null }) => void;
}

export function useCardGesture(handlers: CardGestureHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    // A control owns its own press: pushing it must not become a tap on the
    // card, and it must not lose its default behaviour either.
    if (isCardControlTarget(event.target)) return;

    // Stops the browser from starting its own image drag or a text selection
    // that would fight the native drag loop. Only for the mouse: suppressing the
    // default on a touch press would also suppress scrolling.
    if (event.pointerType === "mouse") event.preventDefault();
    event.stopPropagation();

    const origin = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    // OLE has no touch or pen story; those gestures simply never become a drag.
    const canDrag = event.pointerType === "mouse";
    const target = event.target;
    let settled = false;

    latest.current.onPressChange?.("pressed");

    const stop = () => {
      if (settled) return;
      settled = true;
      cancelRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
    };

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      if (!exceedsDragThreshold(origin, { x: move.clientX, y: move.clientY })) return;
      stop();
      if (canDrag) {
        latest.current.onPressChange?.("dragging");
        latest.current.onDragOut();
      } else {
        // The gesture simply stopped being a tap.
        latest.current.onPressChange?.("idle");
      }
    };

    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      stop();
      latest.current.onPressChange?.("idle");
      latest.current.onTap({ target });
    };

    // Shared by `pointercancel` and `blur`, which deliver different event types.
    const onCancel = (cancelled: Event) => {
      if (cancelled.type !== "blur" && (cancelled as PointerEvent).pointerId !== pointerId) return;
      stop();
      latest.current.onPressChange?.("idle");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    cancelRef.current = stop;
  }, []);

  return { onPointerDown };
}
