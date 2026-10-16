import { describe, expect, it } from "vitest";
import {
  CARD_CONTROL_SELECTOR,
  REPEAT_CLICK_GUARD_MS,
  isRepeatClick,
  quickSlotIndex,
  resolveCardClick,
  type CardClickInput,
} from "./cardInteraction";

const click = (overrides: Partial<CardClickInput> = {}): CardClickInput => ({
  contentType: "text",
  isPrivate: false,
  isControlTarget: false,
  isRepeatClick: false,
  hasTextSelection: false,
  ...overrides,
});

describe("resolveCardClick", () => {
  it("pastes on a plain click for every pasteable content type", () => {
    expect(resolveCardClick(click({ contentType: "text" }))).toBe("paste");
    expect(resolveCardClick(click({ contentType: "image" }))).toBe("paste");
    expect(resolveCardClick(click({ contentType: "file" }))).toBe("paste");
  });

  it("ignores an unknown content type", () => {
    expect(resolveCardClick(click({ contentType: "video" }))).toBe("none");
  });

  it("asks for the password instead of pasting an encrypted item", () => {
    // The previous behaviour threw an error banner from the clipboard writer,
    // which read as "this card is broken" rather than "unlock it first".
    expect(resolveCardClick(click({ isPrivate: true }))).toBe("request-unlock");
  });

  it("prefers unlocking over pasting even for an image", () => {
    expect(resolveCardClick(click({ contentType: "image", isPrivate: true }))).toBe(
      "request-unlock",
    );
  });

  it("leaves clicks on controls alone", () => {
    expect(resolveCardClick(click({ isControlTarget: true }))).toBe("none");
    expect(resolveCardClick(click({ isControlTarget: true, isPrivate: true }))).toBe("none");
  });

  it("ignores the click that ends a text selection", () => {
    expect(resolveCardClick(click({ hasTextSelection: true }))).toBe("none");
  });

  it("collapses a double click into one action", () => {
    expect(resolveCardClick(click({ isRepeatClick: true }))).toBe("none");
  });

  it("reports 'none' rather than 'request-unlock' for a repeated private click", () => {
    // Ordering matters: a shortcut here would open two password prompts.
    expect(resolveCardClick(click({ isPrivate: true, isRepeatClick: true }))).toBe("none");
  });
});

describe("CARD_CONTROL_SELECTOR", () => {
  it("covers every native control a card might put inside it", () => {
    // Each of these has its own behaviour, and the whole card is otherwise a
    // single gesture surface: missing one turns its press into a paste.
    for (const tag of ["button", "a", "input", "textarea", "select"]) {
      expect(CARD_CONTROL_SELECTOR).toContain(tag);
    }
  });

  it("covers the ARIA roles used for menu items", () => {
    expect(CARD_CONTROL_SELECTOR).toContain("[role='button']");
    expect(CARD_CONTROL_SELECTOR).toContain("[role='menuitem']");
    expect(CARD_CONTROL_SELECTOR).toContain("[role='menuitemcheckbox']");
  });

  it("still allows an explicit opt-out", () => {
    expect(CARD_CONTROL_SELECTOR).toContain("[data-card-control]");
  });
});

describe("isRepeatClick", () => {
  const first = { itemId: 7, at: 1_000 };

  it("is false without a previous click", () => {
    expect(isRepeatClick(null, 7, 1_100)).toBe(false);
  });

  it("is true within the guard window", () => {
    expect(isRepeatClick(first, 7, 1_000 + REPEAT_CLICK_GUARD_MS - 1)).toBe(true);
  });

  it("is false once the window has passed", () => {
    expect(isRepeatClick(first, 7, 1_000 + REPEAT_CLICK_GUARD_MS)).toBe(false);
  });

  it("is false for a different card", () => {
    expect(isRepeatClick(first, 8, 1_100)).toBe(false);
  });
});

describe("quickSlotIndex", () => {
  it("numbers the first ten cards of the first page", () => {
    expect(quickSlotIndex(0, false, 0)).toBe(1);
    expect(quickSlotIndex(0, false, 9)).toBe(10);
  });

  it("stops after the tenth card", () => {
    // Only digits 1–0 are bound, and the tenth one is `0`.
    expect(quickSlotIndex(0, false, 10)).toBeNull();
  });

  it("shows nothing on a later page", () => {
    expect(quickSlotIndex(1, false, 0)).toBeNull();
  });

  it("shows nothing while anything is filtered", () => {
    // The shortcut reads the unfiltered history, so a badge under a filter would
    // point at a different item than the key would paste.
    expect(quickSlotIndex(0, true, 3)).toBeNull();
  });

  it("rejects a negative index", () => {
    expect(quickSlotIndex(0, false, -1)).toBeNull();
  });

  it("honours a custom limit", () => {
    expect(quickSlotIndex(0, false, 4, 5)).toBe(5);
    expect(quickSlotIndex(0, false, 5, 5)).toBeNull();
  });
});
