import type { I18nKey } from "./i18n";

/**
 * The product tour.
 *
 * Steps point at live UI through `data-tour` attributes instead of describing
 * screenshots. A step never owns state of its own: `require` names an
 * interaction the user performs on the real app, and `isRequirementMet` decides
 * when the tour may move on. That keeps the copy and the behaviour honest — if
 * a control moves, only its selector changes.
 */

/** Set once the tour has run, so it does not reappear on every launch. */
export const TUTORIAL_SEEN_KEY = "eacptrans-tutorial-seen-v1";

export type TutorialRequirement = "click" | "input" | "menu" | "queue" | "clipboard" | "drag";

export interface TutorialKeyHint {
  combo: string;
  labelKey: I18nKey;
}

export interface TutorialStep {
  id: string;
  titleKey: I18nKey;
  bodyKey: I18nKey;
  /** CSS selector for the element to spotlight. Missing means a centered card. */
  target?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  /** Lets the spotlight stay clickable instead of being covered by a blocker. */
  interactive?: boolean;
  /** Left clicks inside the spotlight are swallowed (right clicks still work). */
  blockLeftClick?: boolean;
  require?: TutorialRequirement;
  requireHintKey?: I18nKey;
  /** Defaults to `target`; use when the interaction belongs to a smaller part. */
  requireSelector?: string;
  keyList?: TutorialKeyHint[];
  /** Renders a button that performs the action in the real UI. */
  demo?: "queue";
}

export interface TutorialShortcuts {
  togglePanel: string;
  quickPastePrefix: string;
  queueStep: string;
  stackPrefix: string;
  translate: string;
  itemTag: string;
  itemPrivate: string;
  itemPin: string;
  itemDelete: string;
  itemOcr: string;
  itemZoom: string;
}

export interface TutorialContext {
  hasItems: boolean;
  /**
   * A file or image card is on screen. Text cards deliberately cannot be
   * dragged out, so asking the user to try it on one would only produce the
   * "text cannot be dragged" error.
   */
  hasDraggable: boolean;
  shortcuts: TutorialShortcuts;
}

/** Renders a stored accelerator the way the settings recorder shows it. */
export function displayShortcut(value: string): string {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (["commandorcontrol", "cmdorctrl", "ctrl", "control"].includes(lower)) return "Ctrl";
      if (["super", "meta", "win", "windows", "command", "cmd"].includes(lower)) return "Win";
      if (lower === "alt" || lower === "option") return "Alt";
      if (lower === "shift") return "Shift";
      if (lower === "escape" || lower === "esc") return "Esc";
      if (lower === "delete" || lower === "del") return "Delete";
      if (part.length === 1) return part.toUpperCase();
      return part;
    });
  return parts.join("+");
}

export interface TutorialInteractionState {
  clicked: boolean;
  typed: boolean;
  dragged: boolean;
  menuOpen: boolean;
  queueDelta: number;
  clipboardDelta: number;
}

/** Whether the interaction a step asks for has happened yet. */
export function isRequirementMet(
  step: TutorialStep,
  state: TutorialInteractionState,
): boolean {
  switch (step.require) {
    case undefined:
      return true;
    case "click":
      return state.clicked;
    case "input":
      return state.typed;
    case "menu":
      return state.menuOpen;
    case "queue":
      return state.queueDelta > 0;
    case "clipboard":
      return state.clipboardDelta > 0;
    case "drag":
      return state.dragged;
  }
}

const CARD = "[data-card-id]";

export function buildTutorialSteps(ctx: TutorialContext): TutorialStep[] {
  const s = ctx.shortcuts;
  const cardTarget = ctx.hasItems ? CARD : undefined;
  const queueTarget = ctx.hasItems ? '[data-tour="card-body"]' : undefined;
  const steps: TutorialStep[] = [
    {
      id: "welcome",
      titleKey: "tutorialWelcomeTitle",
      bodyKey: "tutorialWelcomeDesc",
      placement: "center",
    },
    {
      id: "capture",
      titleKey: "tutorialCaptureTitle",
      bodyKey: "tutorialCaptureDesc",
      // Centered on purpose: the point is to copy from *another* app, and the
      // resulting card is introduced by the next step once it has arrived.
      placement: "center",
      require: "clipboard",
      requireHintKey: "tutorialRequireCopy",
    },
    {
      id: "card-anatomy",
      titleKey: "tutorialCardTitle",
      bodyKey: "tutorialCardDesc",
      target: cardTarget,
      placement: "right",
    },
    {
      id: "menu-open",
      titleKey: "tutorialMenuOpenTitle",
      bodyKey: "tutorialMenuOpenDesc",
      target: cardTarget,
      placement: "right",
      interactive: Boolean(cardTarget),
      blockLeftClick: true,
      require: cardTarget ? "menu" : undefined,
      requireHintKey: cardTarget ? "tutorialRequireMenu" : undefined,
    },
    {
      id: "menu-overview",
      titleKey: "tutorialMenuTitle",
      bodyKey: "tutorialMenuDesc",
      target: '[data-tour="card-menu"]',
      placement: "right",
    },
    {
      id: "paste-drag",
      titleKey: "tutorialPasteTitle",
      bodyKey: "tutorialPasteDesc",
      // Only files and images can be dragged out. When there is one, let the
      // user actually perform the gesture; otherwise the card stays blocked and
      // the copy explains the limitation.
      target: ctx.hasDraggable ? '[data-tour="draggable-card"]' : '[data-tour="card-body"]',
      placement: "right",
      interactive: ctx.hasDraggable,
      require: ctx.hasDraggable ? "drag" : undefined,
      requireHintKey: ctx.hasDraggable ? "tutorialRequireDrag" : undefined,
      requireSelector: ctx.hasDraggable
        ? '[data-tour="draggable-card"] [data-tour="card-body"]'
        : undefined,
    },
    {
      id: "queue",
      titleKey: "tutorialQueueTitle",
      bodyKey: "tutorialQueueDesc",
      target: queueTarget,
      placement: "right",
      require: ctx.hasItems ? "queue" : undefined,
      requireHintKey: ctx.hasItems ? "tutorialRequireQueue" : undefined,
      demo: ctx.hasItems ? "queue" : undefined,
      keyList: [{ combo: displayShortcut(s.queueStep), labelKey: "tutorialShortcutQueue" }],
    },
    {
      id: "search-open",
      titleKey: "tutorialSearchTitle",
      bodyKey: "tutorialSearchDesc",
      target: '[data-tour="search-toggle"]',
      placement: "bottom",
      interactive: true,
      require: "click",
      requireHintKey: "tutorialRequireClick",
    },
    {
      id: "search-syntax",
      titleKey: "tutorialSearchSyntaxTitle",
      bodyKey: "tutorialSearchSyntaxDesc",
      target: '[data-tour="search-input"]',
      placement: "bottom",
      interactive: true,
      require: "input",
      requireHintKey: "tutorialRequireType",
    },
    {
      id: "tag-filter",
      titleKey: "tutorialTagFilterTitle",
      bodyKey: "tutorialTagFilterDesc",
      target: '[data-tour="tab-tags"]',
      placement: "bottom",
      interactive: true,
      require: "click",
      requireHintKey: "tutorialRequireClick",
    },
    {
      id: "tag-filter-row",
      titleKey: "tutorialTagRowTitle",
      bodyKey: "tutorialTagRowDesc",
      target: '[data-tour="tag-selector-row"]',
      placement: "bottom",
      interactive: true,
    },
    {
      id: "tabs",
      titleKey: "tutorialTabsTitle",
      bodyKey: "tutorialTabsDesc",
      target: '[data-tour="tabs"]',
      placement: "bottom",
    },
    {
      id: "pin-window",
      titleKey: "tutorialPinTitle",
      bodyKey: "tutorialPinDesc",
      target: '[data-tour="pin-window"]',
      placement: "bottom",
    },
    {
      id: "tag-admin",
      titleKey: "tutorialTagAdminTitle",
      bodyKey: "tutorialTagAdminDesc",
      target: '[data-tour="tab-tag-manager"]',
      placement: "bottom",
      interactive: true,
      require: "click",
      requireHintKey: "tutorialRequireClick",
    },
    {
      id: "tag-rules",
      titleKey: "tutorialRulesTitle",
      bodyKey: "tutorialRulesDesc",
      target: '[data-tour="tag-manager-page"]',
      placement: "right",
    },
    {
      id: "settings",
      titleKey: "tutorialSettingsTitle",
      bodyKey: "tutorialSettingsDesc",
      target: '[data-tour="tab-settings"]',
      placement: "bottom",
      interactive: true,
      require: "click",
      requireHintKey: "tutorialRequireClick",
    },
    {
      id: "settings-page",
      titleKey: "tutorialSettingsPageTitle",
      bodyKey: "tutorialSettingsPageDesc",
      target: '[data-tour="settings-general"]',
      placement: "right",
    },
    {
      id: "shortcuts",
      titleKey: "tutorialShortcutsTitle",
      bodyKey: "tutorialShortcutsDesc",
      placement: "center",
      keyList: [
        { combo: displayShortcut(s.togglePanel), labelKey: "tutorialShortcutPanel" },
        {
          combo: `${displayShortcut(s.quickPastePrefix)} + 1…0`,
          labelKey: "tutorialShortcutQuickPaste",
        },
        { combo: displayShortcut(s.queueStep), labelKey: "tutorialShortcutQueue" },
        {
          combo: `${displayShortcut(s.stackPrefix)} + ↑/↓`,
          labelKey: "tutorialShortcutStack",
        },
        { combo: displayShortcut(s.translate), labelKey: "tutorialShortcutTranslate" },
      ],
    },
    {
      id: "shortcuts-items",
      titleKey: "tutorialShortcutsItemsTitle",
      bodyKey: "tutorialShortcutsItemsDesc",
      placement: "center",
      keyList: [
        { combo: s.itemTag, labelKey: "tutorialShortcutMenu" },
        { combo: `${s.itemPin} / ${s.itemPrivate}`, labelKey: "tutorialShortcutPinPrivate" },
        { combo: `${s.itemOcr} / ${s.itemZoom}`, labelKey: "tutorialShortcutOcrZoom" },
        { combo: s.itemDelete, labelKey: "tutorialShortcutDelete" },
        { combo: "Space", labelKey: "tutorialShortcutQueueToggle" },
      ],
    },
    {
      id: "finish",
      titleKey: "tutorialFinishTitle",
      bodyKey: "tutorialFinishDesc",
      placement: "center",
    },
  ];

  return steps;
}
