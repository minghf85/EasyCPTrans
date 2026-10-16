import { describe, expect, it } from "vitest";
import {
  escapeTarget,
  isEditingField,
  shouldHandleCardShortcut,
  type EscapeTargets,
  type FieldLike,
} from "./interactionRules";

/** A stand-in for a DOM node, so these rules can be tested without one. */
function element(tagName: string, extra: Partial<FieldLike> = {}): FieldLike {
  return { tagName, ...extra };
}

describe("isEditingField", () => {
  it("is false without a target", () => {
    expect(isEditingField(null)).toBe(false);
    expect(isEditingField(undefined)).toBe(false);
  });

  it("recognises the native text fields", () => {
    expect(isEditingField(element("input"))).toBe(true);
    expect(isEditingField(element("TEXTAREA"))).toBe(true);
    expect(isEditingField(element("select"))).toBe(true);
  });

  it("recognises an editable region", () => {
    expect(isEditingField(element("div", { isContentEditable: true }))).toBe(true);
  });

  it("recognises a field that only says so through its role", () => {
    // The quick-edit page and any future rich text surface are not `input`s.
    for (const role of ["textbox", "searchbox", "combobox"]) {
      expect(isEditingField(element("div", { getAttribute: () => role }))).toBe(true);
    }
  });

  it("leaves everything else to the card shortcuts", () => {
    expect(isEditingField(element("div"))).toBe(false);
    expect(isEditingField(element("button"))).toBe(false);
    expect(isEditingField(element("div", { getAttribute: () => null }))).toBe(false);
    expect(isEditingField(element("div", { getAttribute: () => "menuitem" }))).toBe(false);
  });
});

describe("shouldHandleCardShortcut", () => {
  const free = { viewOwnsKeyboard: false, overlayOpen: false, editingField: false };

  it("lets the strip handle keys when nothing is on top of it", () => {
    expect(shouldHandleCardShortcut(free)).toBe(true);
  });

  it("stands down for a full-page view", () => {
    expect(shouldHandleCardShortcut({ ...free, viewOwnsKeyboard: true })).toBe(false);
  });

  it("stands down for any overlay", () => {
    // This is the rule that keeps Delete from deleting the card behind the
    // lightbox, and Enter from pasting while the match panel is open.
    expect(shouldHandleCardShortcut({ ...free, overlayOpen: true })).toBe(false);
  });

  it("stands down while the user is typing", () => {
    expect(shouldHandleCardShortcut({ ...free, editingField: true })).toBe(false);
  });

  it("stands down when several reasons apply at once", () => {
    expect(
      shouldHandleCardShortcut({ viewOwnsKeyboard: true, overlayOpen: true, editingField: true }),
    ).toBe(false);
  });
});

describe("escapeTarget", () => {
  const none: EscapeTargets = {
    privacyPrompt: false,
    ocrPanel: false,
    matchPanel: false,
    cardMenu: false,
    search: false,
  };

  it("closes nothing when nothing is open", () => {
    expect(escapeTarget(none)).toBe("none");
  });

  it("closes the innermost thing first", () => {
    expect(escapeTarget({ ...none, cardMenu: true, search: true })).toBe("cardMenu");
    expect(escapeTarget({ ...none, matchPanel: true, cardMenu: true, search: true })).toBe(
      "matchPanel",
    );
    expect(escapeTarget({ ...none, ocrPanel: true, matchPanel: true, search: true })).toBe("ocrPanel");
  });

  it("puts the password prompt above everything", () => {
    expect(
      escapeTarget({
        privacyPrompt: true,
        ocrPanel: true,
        matchPanel: true,
        cardMenu: true,
        search: true,
      }),
    ).toBe("privacyPrompt");
  });

  it("closes the search box last", () => {
    expect(escapeTarget({ ...none, search: true })).toBe("search");
  });

  it("closes each overlay on its own", () => {
    expect(escapeTarget({ ...none, ocrPanel: true })).toBe("ocrPanel");
    expect(escapeTarget({ ...none, matchPanel: true })).toBe("matchPanel");
    expect(escapeTarget({ ...none, cardMenu: true })).toBe("cardMenu");
  });
});
