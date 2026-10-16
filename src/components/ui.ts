/**
 * Corporate Clean tokens.
 *
 * Every surface pulls from here rather than repeating utility strings inline,
 * which is what keeps the style from drifting between components. The file is
 * organised the way the window is: regions first, then the surfaces inside them,
 * then the controls.
 *
 * Three rules keep the result flat and legible:
 *
 * 1. **One border per element.** A control is a border *or* a fill, never a
 *    border plus a shadow — stacking the two reads as a double edge, and putting
 *    a bordered control inside a bordered container doubles it again.
 * 2. **Motion reports state, it does not move things.** Nothing lifts on hover;
 *    colour and shadow carry the feedback. (This also means no element ever
 *    becomes the containing block for a fixed-position child.)
 * 3. **Focus is visible without becoming a second border.** Standalone controls
 *    get a single blue ring on keyboard focus; items inside a popup or a dense
 *    list get a filled highlight, the way a native menu does.
 */

/** Shared timing. Nothing in the app animates for longer than this. */
export const transition = "transition duration-200 ease-out";

/**
 * Keyboard focus ring for a standalone control. No offset: the ring already
 * contrasts with the control's own edge, and an offset ring next to a border is
 * the double edge this system is trying to avoid. `focus-visible` keeps it off
 * mouse clicks.
 */
export const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** Focus for an item inside a popup or a dense list: the native-menu treatment. */
export const focusFill = "focus:outline-none focus:bg-blue-600 focus:text-white";

/** Focus for a text field: a coloured edge plus a soft halo, not a second border. */
export const focusHalo =
  "focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25";

/* ────────────────────────────── Regions ────────────────────────────── */

/** Top navigation bar. One hairline separates it from the tray. */
export const navBar =
  "flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2";

/**
 * The tray the cards sit in: a recessed well, so the cards read as objects on a
 * surface rather than as borders on a background. The inset shadow is the depth;
 * there is deliberately no border as well.
 */
export const tray =
  "eacp-scroll flex h-full gap-4 overflow-x-auto overflow-y-hidden rounded-xl bg-slate-100 p-3 shadow-[inset_0_2px_10px_rgba(15,23,42,0.06)]";

/* ────────────────────────────── Surfaces ───────────────────────────── */

/** A bordered container: card, modal panel, list group. */
export const surface = "rounded-xl border border-gray-200 bg-white shadow-sm";

/** Hover for a bordered container: a firmer edge and a deeper shadow, no movement. */
export const surfaceInteractive = `${transition} hover:border-gray-300 hover:shadow-md`;

/** Recessed area *inside* a container — no border, the container already has one. */
export const inset = "rounded-lg bg-gray-50";

/** A row inside a container. */
export const row = `rounded-lg ${transition}`;

/** A row that reacts to the pointer. */
export const rowInteractive = `${row} hover:bg-gray-50`;

/** Popup surface: the context menu. */
export const menuSurface =
  "fixed z-[60] flex items-start gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-md";

/** Column inside a popup. */
export const menuColumn = "eacp-scroll max-h-[min(420px,calc(100vh-24px))] overflow-y-auto";

/** One entry in a popup. */
export const menuItem = [
  "flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
  transition,
  focusFill,
  "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
].join(" ");

/** Destructive entry: same shape, its own colour, behind a separator. */
export const menuItemDanger = [
  "flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
  transition,
  "text-red-600 hover:bg-red-50 focus:bg-red-600 focus:text-white focus:outline-none",
].join(" ");

/** Divider between groups inside a popup. */
export const menuSeparator = "my-1 border-t border-gray-100";

/* ────────────────────────────── Controls ───────────────────────────── */

const buttonBase = [
  "inline-flex items-center justify-center gap-2",
  "rounded-lg px-3 py-2 text-sm font-medium",
  transition,
  focusRing,
  "active:scale-[0.98] active:translate-y-0",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

/** Primary action. Pure colour, no shadow: the colour is the affordance. */
export const buttonPrimary = `${buttonBase} bg-blue-600 text-white hover:bg-blue-700`;

/** Secondary action on a light surface. */
export const buttonSecondary = `${buttonBase} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

/** Destructive action, used sparingly and never as the default choice. */
export const buttonDanger = `${buttonBase} border border-gray-300 bg-white text-red-600 hover:border-red-300 hover:bg-red-50`;

/** Text-only action for dense toolbars and menu rows. */
export const buttonGhost = `${buttonBase} text-gray-600 hover:bg-gray-100 hover:text-gray-900`;

const iconBase = [
  "inline-flex shrink-0 items-center justify-center rounded-lg",
  transition,
  focusRing,
  "active:scale-[0.98] active:translate-y-0",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

/** Square control for toolbars and popup headers. */
export const iconButton = `${iconBase} border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900`;

/** Square control that is part of a group, so it carries no edge of its own. */
export const iconButtonQuiet = `${iconBase} text-gray-500 hover:bg-gray-100 hover:text-gray-900`;

/** Square control in its on state: one filled shape, no ring, no second edge. */
export const iconButtonActive = `${iconBase} bg-blue-600 text-white hover:bg-blue-700`;

/* ────────────────────────────── Fields ────────────────────────────── */

/** Text input: one border, and a halo on focus rather than a ring around it. */
export const input = [
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900",
  "placeholder:text-gray-400",
  transition,
  focusHalo,
  "disabled:opacity-50",
].join(" ");

/** Monospace input for pattern and path fields. */
export const inputMono = `${input} font-mono text-xs`;

/** Native select styled to match the inputs. */
export const select = `${input} pr-8`;

/** Checkbox control. */
export const checkbox =
  "h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 transition duration-200 ease-out focus:ring-2 focus:ring-blue-500 disabled:opacity-50";

/* ────────────────────────────── Labels ────────────────────────────── */

/** Neutral status pill. Never the only carrier of meaning — always paired with text. */
export const pill =
  "inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600";

/** Pill for something that is currently switched on. */
export const pillAccent =
  "inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700";

/* ────────────────────────────── Overlays ──────────────────────────── */

/** Modal backdrop. */
export const overlay =
  "eacp-animate-fade fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/50 p-4";

/** Modal container. The deepest shadow in the system; nothing goes past it. */
export const modalPanel = "rounded-xl border border-gray-200 bg-white shadow-md";
