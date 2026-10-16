/**
 * Who owns the keyboard.
 *
 * Every card shortcut is registered on `window`, so anything layered above the
 * strip has to be able to take the keyboard away: the lightbox, the match panel,
 * the OCR review, the password prompt, the actions menu, and any text field.
 *
 * Without that rule `Delete` deleted the card *behind* the lightbox, `Space` and
 * `Tab` moved the paste queue while the user was looking at an image, the arrow
 * keys flipped cards underneath, and `Enter` hid the panel and pasted something
 * nobody had asked for.
 */

export interface FieldLike {
  tagName: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** True when the event came from something the user is typing into. */
export function isEditingField(target: FieldLike | null | undefined): boolean {
  if (!target) return false;

  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;

  const role = target.getAttribute?.("role");
  return role === "textbox" || role === "searchbox" || role === "combobox";
}

export interface KeyboardOwnerInput {
  /** Settings and Tag Admin replace the strip rather than covering it. */
  viewOwnsKeyboard: boolean;
  /** A modal, panel or popup is above the strip. */
  overlayOpen: boolean;
  editingField: boolean;
}

/** True when the card shortcuts may act on this key event. */
export function shouldHandleCardShortcut(input: KeyboardOwnerInput): boolean {
  return !input.viewOwnsKeyboard && !input.overlayOpen && !input.editingField;
}

/** What is open, from the point of view of the Escape key. */
export interface EscapeTargets {
  privacyPrompt: boolean;
  ocrPanel: boolean;
  matchPanel: boolean;
  cardMenu: boolean;
  search: boolean;
}

export type EscapeAction = keyof EscapeTargets | "none";

/**
 * What Escape closes, innermost first.
 *
 * The order is the layering order, not the declaration order: a password prompt
 * is above everything, the search box is the outermost thing Escape can close
 * without leaving the strip. The lightbox is deliberately absent — it closes
 * itself, because it is the only overlay that also owns other keys.
 */
export function escapeTarget(targets: EscapeTargets): EscapeAction {
  if (targets.privacyPrompt) return "privacyPrompt";
  if (targets.ocrPanel) return "ocrPanel";
  if (targets.matchPanel) return "matchPanel";
  if (targets.cardMenu) return "cardMenu";
  if (targets.search) return "search";
  return "none";
}
