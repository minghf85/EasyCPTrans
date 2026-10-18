import { describe, expect, it } from "vitest";
import {
  buildTutorialSteps,
  displayShortcut,
  isRequirementMet,
  type TutorialContext,
  type TutorialInteractionState,
  type TutorialStep,
} from "./tutorial";

const shortcuts: TutorialContext["shortcuts"] = {
  togglePanel: "CommandOrControl+Shift+V",
  quickPastePrefix: "CommandOrControl+Shift",
  queueStep: "CommandOrControl+Alt+V",
  stackPrefix: "CommandOrControl+Alt",
  translate: "Alt+C",
  itemTag: "T",
  itemPrivate: "M",
  itemPin: "P",
  itemDelete: "Delete",
  itemOcr: "O",
  itemZoom: "Z",
};

const idle: TutorialInteractionState = {
  clicked: false,
  typed: false,
  dragged: false,
  menuOpen: false,
  queueDelta: 0,
  clipboardDelta: 0,
};

function step(require: TutorialStep["require"]): TutorialStep {
  return {
    id: "test",
    titleKey: "tutorialWelcomeTitle",
    bodyKey: "tutorialWelcomeDesc",
    require,
  };
}

describe("displayShortcut", () => {
  it("renders the platform modifier names", () => {
    expect(displayShortcut("CommandOrControl+Shift+V")).toBe("Ctrl+Shift+V");
    expect(displayShortcut("Super+Alt+ArrowUp")).toBe("Win+Alt+ArrowUp");
    expect(displayShortcut("Alt+C")).toBe("Alt+C");
    expect(displayShortcut("Delete")).toBe("Delete");
    expect(displayShortcut("CommandOrControl+Shift")).toBe("Ctrl+Shift");
  });
});

describe("isRequirementMet", () => {
  it("always passes a step without a requirement", () => {
    expect(isRequirementMet(step(undefined), idle)).toBe(true);
  });

  it("accepts the matching interaction for each requirement", () => {
    expect(isRequirementMet(step("click"), { ...idle, clicked: true })).toBe(true);
    expect(isRequirementMet(step("input"), { ...idle, typed: true })).toBe(true);
    expect(isRequirementMet(step("menu"), { ...idle, menuOpen: true })).toBe(true);
    expect(isRequirementMet(step("queue"), { ...idle, queueDelta: 1 })).toBe(true);
    expect(isRequirementMet(step("clipboard"), { ...idle, clipboardDelta: 1 })).toBe(true);
    expect(isRequirementMet(step("drag"), { ...idle, dragged: true })).toBe(true);
  });

  it("does not accept an unrelated interaction", () => {
    expect(isRequirementMet(step("click"), { ...idle, typed: true })).toBe(false);
    expect(isRequirementMet(step("queue"), { ...idle, queueDelta: 0 })).toBe(false);
    expect(isRequirementMet(step("clipboard"), { ...idle, clipboardDelta: 0 })).toBe(false);
  });
});

describe("buildTutorialSteps", () => {
  it("covers the app from capture to settings", () => {
    const steps = buildTutorialSteps({ hasItems: true, hasDraggable: true, shortcuts });
    const ids = steps.map((entry) => entry.id);

    expect(ids[0]).toBe("welcome");
    expect(ids[ids.length - 1]).toBe("finish");
    expect(ids).toEqual([
      "welcome",
      "capture",
      "card-anatomy",
      "menu-open",
      "menu-overview",
      "paste-drag",
      "queue",
      "search-open",
      "search-syntax",
      "tag-filter",
      "tag-filter-row",
      "tabs",
      "pin-window",
      "tag-admin",
      "tag-rules",
      "settings",
      "settings-page",
      "shortcuts",
      "shortcuts-items",
      "finish",
    ]);
  });

  it("asks for a copy before anything has been captured", () => {
    const steps = buildTutorialSteps({ hasItems: false, hasDraggable: false, shortcuts });
    const capture = steps.find((entry) => entry.id === "capture");
    const queue = steps.find((entry) => entry.id === "queue");
    const menu = steps.find((entry) => entry.id === "menu-open");

    expect(capture?.target).toBeUndefined();
    expect(capture?.require).toBe("clipboard");
    expect(queue?.require).toBeUndefined();
    expect(queue?.demo).toBeUndefined();
    expect(menu?.require).toBeUndefined();
  });

  it("only asks for a drag when a file or image card exists", () => {
    const withDrag = buildTutorialSteps({ hasItems: true, hasDraggable: true, shortcuts });
    const dragStep = withDrag.find((entry) => entry.id === "paste-drag");

    expect(dragStep?.require).toBe("drag");
    expect(dragStep?.interactive).toBe(true);
    expect(dragStep?.target).toBe('[data-tour="draggable-card"]');
    expect(dragStep?.requireSelector).toBe(
      '[data-tour="draggable-card"] [data-tour="card-body"]',
    );

    const textOnly = buildTutorialSteps({ hasItems: true, hasDraggable: false, shortcuts });
    const infoStep = textOnly.find((entry) => entry.id === "paste-drag");

    expect(infoStep?.require).toBeUndefined();
    expect(infoStep?.interactive).toBeFalsy();
    expect(infoStep?.target).toBe('[data-tour="card-body"]');
  });

  it("uses the configured accelerators in the cheat sheet", () => {
    const steps = buildTutorialSteps({ hasItems: false, hasDraggable: false, shortcuts });
    const cheat = steps.find((entry) => entry.id === "shortcuts");

    expect(cheat?.keyList?.some((entry) => entry.combo === "Ctrl+Shift+V")).toBe(true);
    expect(cheat?.keyList?.some((entry) => entry.combo === "Ctrl+Alt + ↑/↓")).toBe(true);
    expect(cheat?.keyList?.some((entry) => entry.combo === "Ctrl+Shift + 1…0")).toBe(true);
  });
});
