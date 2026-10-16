import type { HistoryItem } from "../types";

/**
 * What a pointer gesture on a card should do, decided without touching the DOM.
 *
 * Card interaction is the part of this app that is hardest to test — it needs a
 * real window, a real pointer and a real drag loop — so the decision itself
 * lives here as a pure function and the component only carries it out. The
 * table-driven tests in `cardInteraction.test.ts` are the specification.
 */

/** Two clicks closer together than this on the same card are treated as one action. */
export const REPEAT_CLICK_GUARD_MS = 320;

export type CardClickAction =
  /** Write the item to the clipboard and paste it into the previous window. */
  | "paste"
  /** The content is encrypted: ask for the password before doing anything. */
  | "request-unlock"
  /** The gesture belongs to something inside the card, or means nothing. */
  | "none";

export interface CardClickInput {
  contentType: HistoryItem["contentType"];
  isPrivate: boolean;
  /** The click landed on a button, input, menu or other interactive child. */
  isControlTarget: boolean;
  /** Second click of a double click, already handled by the first one. */
  isRepeatClick: boolean;
  /** A text selection survived into this click, so the user was selecting. */
  hasTextSelection: boolean;
}

const PASTEABLE_TYPES = new Set(["text", "image", "file"]);

export function resolveCardClick(input: CardClickInput): CardClickAction {
  if (!PASTEABLE_TYPES.has(input.contentType)) return "none";
  if (input.isControlTarget) return "none";
  // A click that ends a drag-selection is not a request to paste.
  if (input.hasTextSelection) return "none";
  // A double click is one intent; without this the item is written to the
  // clipboard twice and `use_count` jumps.
  if (input.isRepeatClick) return "none";
  if (input.isPrivate) return "request-unlock";
  return "paste";
}

export interface ClickStamp {
  itemId: number;
  at: number;
}

/** True while a second click is still part of the previous one. */
export function isRepeatClick(
  previous: ClickStamp | null,
  itemId: number,
  now: number,
  guardMs = REPEAT_CLICK_GUARD_MS,
): boolean {
  if (!previous) return false;
  if (previous.itemId !== itemId) return false;
  return now - previous.at < guardMs;
}

/**
 * The number a card should show for the quick-paste shortcut, or `null` when
 * showing one would be a lie.
 *
 * The shortcut itself is served by the backend, which reads the *unfiltered*
 * clipboard history by offset, while the strip can be showing a filtered or
 * paged subset of it. The two orders only provably agree on the first page with
 * nothing filtered — which is exactly when the badge is drawn.
 */
export function quickSlotIndex(
  page: number,
  hasFilters: boolean,
  itemIndex: number,
  limit = 10,
): number | null {
  if (page !== 0 || hasFilters) return null;
  if (itemIndex < 0 || itemIndex >= limit) return null;
  return itemIndex + 1;
}

/**
 * Whether the pointer is inside an interactive child of the card.
 *
 * Cards are one big gesture surface — a press anywhere either activates the item
 * or drags it out — so anything that has its own behaviour has to be excluded.
 * The selector covers the native interactive elements as well as the explicit
 * `data-card-control` opt-out, because relying on an attribute alone means a
 * newly added button silently turns into a paste the day someone forgets it.
 */
export const CARD_CONTROL_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[data-card-control]",
].join(", ");

export function isCardControlTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => Element | null } | null;
  if (!element?.closest) return false;
  return element.closest(CARD_CONTROL_SELECTOR) !== null;
}
