/**
 * Stage primitives.
 *
 * Everything in the film is a pure function of the shot-local clock, so the
 * player can pause and scrub without special cases. These helpers turn a time
 * value into the usual cinematic verbs: reveal, type, move, press, fly.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileArchive,
  FileImage,
  FileText,
  Folder,
  LockKeyhole,
  Minus,
  ShieldCheck,
  Square,
  Tag,
  Wifi,
  X,
} from "lucide-react";

import { ClipboardCard, type CardActions } from "../../../src/components/ClipboardCard";
import type { HistoryItem } from "../../../src/types";
import { DEMO_TAGS } from "../demo/data";

/* ────────────────────────────── Time helpers ───────────────────────────── */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 0→1 across [start, start + duration]. */
export function progress(time: number, start: number, duration = 0.5): number {
  if (duration <= 0) return time >= start ? 1 : 0;
  return clamp01((time - start) / duration);
}

export const easeOut = (p: number) => 1 - (1 - p) ** 3;
export const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
export const easeOutBack = (p: number) => {
  const c = 1.70158;
  const c3 = c + 1;
  return 1 + c3 * (p - 1) ** 3 + c * (p - 1) ** 2;
};

/** A slow sine float, for background cards and chips. */
export const drift = (time: number, phase = 0, amplitude = 6, speed = 0.8) =>
  Math.sin(time * speed + phase) * amplitude;

/* ────────────────────────────── Stage scale ─────────────────────────────── */

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** Scales the 1920×1080 stage into its 16:9 container. */
export function useStageScale() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () =>
      setScale(
        Math.min(node.clientWidth / STAGE_WIDTH, node.clientHeight / STAGE_HEIGHT),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, scale };
}

/* ────────────────────────────── Reveal / type ──────────────────────────── */

interface RevealProps {
  t: number;
  at: number;
  duration?: number;
  x?: number;
  y?: number;
  scale?: number;
  blur?: boolean;
  ease?: (p: number) => number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Reveal({
  t,
  at,
  duration = 0.55,
  x = 0,
  y = 22,
  scale = 1,
  blur = false,
  ease = easeOut,
  children,
  className,
  style,
}: RevealProps) {
  const p = ease(progress(t, at, duration));
  return (
    <div
      className={className}
      style={{
        opacity: p,
        transform: `translate3d(${(1 - p) * x}px, ${(1 - p) * y}px, 0) scale(${
          1 + (scale - 1) * p
        })`,
        filter: blur ? `blur(${(1 - p) * 10}px)` : undefined,
        willChange: "opacity, transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface TypedProps {
  text: string;
  t: number;
  at: number;
  cps?: number;
  className?: string;
  caret?: boolean;
  caretClassName?: string;
}

/** Types the string at `cps` characters per second, starting at `at`. */
export function Typed({
  text,
  t,
  at,
  cps = 24,
  className,
  caret = true,
  caretClassName,
}: TypedProps) {
  const count = Math.max(0, Math.min(text.length, Math.floor((t - at) * cps)));
  const typing = t >= at && count < text.length;
  return (
    <span className={className}>
      {text.slice(0, count)}
      {caret && (typing || (t >= at && Math.floor(t * 2) % 2 === 0)) && (
        <span
          className={caretClassName ?? "ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.12em] bg-blue-500"}
          style={{ opacity: typing ? 1 : 0.35 }}
        />
      )}
    </span>
  );
}

/* ────────────────────────────── Cursor ─────────────────────────────────── */

export interface CursorPoint {
  at: number;
  x: number;
  y: number;
}

function cursorPosition(points: CursorPoint[], time: number) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (time <= points[0].at) return points[0];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (time < next.at) {
      const p = easeInOut(clamp01((time - current.at) / Math.max(0.001, next.at - current.at)));
      return {
        x: current.x + (next.x - current.x) * p,
        y: current.y + (next.y - current.y) * p,
      };
    }
  }
  return points[points.length - 1];
}

interface CursorProps {
  t: number;
  points: CursorPoint[];
  clicks?: number[];
  visibleFrom?: number;
  visibleTo?: number;
  size?: number;
}

export function Cursor({ t, points, clicks = [], visibleFrom = 0, visibleTo = Infinity, size = 34 }: CursorProps) {
  const { x, y } = cursorPosition(points, t);
  const visible = t >= visibleFrom && t <= visibleTo;
  if (!visible) return null;
  const clicking = clicks.some((click) => t >= click && t < click + 0.18);
  return (
    <>
      {clicks.map((click, index) =>
        t >= click && t < click + 0.55 ? (
          <span
            key={index}
            className="pointer-events-none absolute rounded-full border-2 border-blue-500"
            style={{
              left: x - 26,
              top: y - 26,
              width: 52,
              height: 52,
              opacity: 1 - (t - click) / 0.55,
              transform: `scale(${0.5 + (t - click) * 2.2})`,
            }}
          />
        ) : null,
      )}
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute drop-shadow-[0_2px_4px_rgba(15,23,42,0.35)]"
        style={{
          left: x,
          top: y,
          width: size,
          height: size,
          transform: `scale(${clicking ? 0.86 : 1})`,
          transformOrigin: "top left",
        }}
      >
        <path
          d="M4 2.5 19 12l-6.4 1.3L9.4 21 4 2.5Z"
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}

/* ────────────────────────────── Keys ───────────────────────────────────── */

interface KeycapProps {
  label: string;
  pressed?: boolean;
  wide?: boolean;
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
}

export function Keycap({ label, pressed = false, wide = false, tone = "light", size = "md" }: KeycapProps) {
  const sizes = {
    sm: "h-12 px-4 text-[18px] rounded-lg",
    md: "h-20 min-w-[108px] px-6 text-[30px] rounded-xl",
    lg: "h-24 min-w-[132px] px-7 text-[36px] rounded-2xl",
  }[size];
  const palette =
    tone === "dark"
      ? pressed
        ? "border-blue-400 bg-blue-500/20 text-blue-100"
        : "border-white/15 bg-white/[0.06] text-white/85"
      : pressed
        ? "border-blue-400 bg-blue-50 text-blue-700"
        : "border-gray-300 bg-white text-gray-800";
  return (
    <kbd
      className={`inline-flex items-center justify-center border font-semibold tracking-tight transition-none ${sizes} ${palette}`}
      style={{
        transform: pressed ? "translateY(4px)" : "translateY(0)",
        boxShadow: pressed
          ? "0 0 0 0 transparent"
          : tone === "dark"
            ? "0 4px 0 0 rgba(255,255,255,0.14)"
            : "0 4px 0 0 #d1d5db",
        minWidth: wide ? "190px" : undefined,
      }}
    >
      {label}
    </kbd>
  );
}

export function KeyCombo({
  keys,
  t,
  showAt,
  pressAt,
  pressDuration = 0.28,
  tone = "light",
  size = "md",
  gap = 14,
}: {
  keys: string[];
  t: number;
  showAt: number;
  pressAt: number;
  pressDuration?: number;
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  gap?: number;
}) {
  const pressed = t >= pressAt && t < pressAt + pressDuration;
  return (
    <div className="flex items-center" style={{ gap }}>
      {keys.map((key, index) => (
        <span key={key} className="flex items-center" style={{ gap }}>
          <Reveal t={t} at={showAt + index * 0.12} y={18} scale={0.94}>
            <Keycap label={key} pressed={pressed} tone={tone} size={size} />
          </Reveal>
          {index < keys.length - 1 && <span className={tone === "dark" ? "text-white/35" : "text-gray-400"}>+</span>}
        </span>
      ))}
    </div>
  );
}

/* ────────────────────────────── Windows ────────────────────────────────── */

interface FakeWindowProps {
  title: string;
  tone?: "light" | "dark";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  accent?: string;
  icon?: ReactNode;
  compact?: boolean;
}

export function FakeWindow({
  title,
  tone = "light",
  children,
  className = "",
  style,
  accent = "#2563eb",
  icon,
  compact = false,
}: FakeWindowProps) {
  const dark = tone === "dark";
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border shadow-[0_24px_60px_rgba(15,23,42,0.22)] ${
        dark ? "border-slate-700 bg-[#0f172a]" : "border-gray-200 bg-white"
      } ${className}`}
      style={style}
    >
      <div
        className={`flex shrink-0 items-center gap-3 border-b ${compact ? "h-11 px-4" : "h-14 px-5"} ${
          dark ? "border-slate-700/80 bg-[#111c31]" : "border-gray-200 bg-gray-50"
        }`}
      >
        <span
          className={`flex items-center justify-center rounded-lg text-white ${compact ? "h-6 w-6" : "h-8 w-8"}`}
          style={{ backgroundColor: accent }}
        >
          {icon ?? <Square className={compact ? "h-3 w-3" : "h-4 w-4"} />}
        </span>
        <span className={`truncate font-medium ${compact ? "text-[13px]" : "text-[15px]"} ${dark ? "text-slate-200" : "text-gray-700"}`}>
          {title}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <Minus className={`h-3.5 w-3.5 ${dark ? "text-slate-500" : "text-gray-400"}`} />
          <Square className={`h-3 w-3 ${dark ? "text-slate-500" : "text-gray-400"}`} />
          <X className={`h-4 w-4 ${dark ? "text-slate-500" : "text-gray-400"}`} />
        </span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export interface CodeRow {
  text: string;
  color?: string;
  muted?: boolean;
  indent?: number;
}

export function CodeWindow({
  t,
  title,
  rows,
  insertedRows,
  insertAt,
  sweepAt,
  selectedWord,
  selectAt,
  style,
  className,
  tone = "dark",
}: {
  t: number;
  title: string;
  rows: CodeRow[];
  insertedRows?: CodeRow[];
  insertAt?: number;
  sweepAt?: number;
  selectedWord?: string;
  selectAt?: number;
  style?: CSSProperties;
  className?: string;
  tone?: "light" | "dark";
}) {
  const insert = easeOut(progress(t, insertAt ?? 999, 0.7));
  const sweep = progress(t, sweepAt ?? 999, 1.1);
  const select = progress(t, selectAt ?? 999, 0.35);
  const dark = tone === "dark";

  return (
    <FakeWindow
      title={title}
      tone={tone}
      style={style}
      className={className}
      accent="#0ea5e9"
      icon={<span className="font-mono text-[11px] font-bold">{"</>"}</span>}
    >
      <div className={`flex h-full ${dark ? "bg-[#0f172a]" : "bg-white"}`}>
        <div className={`w-14 shrink-0 py-4 text-right font-mono text-[11px] leading-[30px] ${dark ? "text-slate-600" : "text-gray-300"}`}>
          {Array.from({ length: 22 }, (_, index) => (
            <div key={index} className="pr-3">
              {index + 1}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 py-4 pr-5 font-mono text-[15px] leading-[30px]">
          {rows.map((row, index) => (
            <div key={index} className="flex" style={{ paddingLeft: (row.indent ?? 0) * 20 }}>
              <span className={row.muted ? (dark ? "text-slate-600" : "text-gray-300") : dark ? "text-slate-300" : "text-gray-700"} style={{ color: row.color }}>
                {row.text.split(selectedWord ?? "\u0000").map((part, partIndex, parts) => (
                  <span key={partIndex}>
                    {part}
                    {partIndex < parts.length - 1 && (
                      <span
                        className="rounded-sm"
                        style={{
                          backgroundColor: `rgba(37,99,235,${0.18 + 0.42 * select})`,
                          boxShadow: select > 0 ? "0 0 0 2px rgba(37,99,235,0.35)" : undefined,
                        }}
                      >
                        {selectedWord}
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </div>
          ))}
          {insertedRows && insertAt !== undefined && (
            <div style={{ opacity: insert }} className="relative -ml-3 my-1 rounded-md px-3 py-1">
              <span
                className="absolute inset-0 rounded-md"
                style={{
                  background: `linear-gradient(90deg, rgba(37,99,235,0.22) ${sweep * 100}%, rgba(37,99,235,0) ${sweep * 100}%)`,
                }}
              />
              {insertedRows.map((row, index) => (
                <div
                  key={index}
                  className="relative font-mono"
                  style={{ paddingLeft: (row.indent ?? 0) * 20, color: row.color ?? (dark ? "#e2e8f0" : "#1f2937") }}
                >
                  {row.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </FakeWindow>
  );
}

export function FormWindow({
  t,
  fields,
  values,
  fillAt,
  activeIndex,
  style,
  className,
}: {
  t: number;
  fields: string[];
  values: string[];
  fillAt: number[];
  activeIndex: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <FakeWindow
      title="新建客户 — 订单系统"
      style={style}
      className={className}
      accent="#7c3aed"
      icon={<FileText className="h-4 w-4" />}
    >
      <div className="space-y-4 p-7">
        {fields.map((field, index) => {
          const filled = easeOut(progress(t, fillAt[index] ?? 999, 0.35));
          const active = activeIndex === index;
          return (
            <label key={field} className="block">
              <span className="mb-1.5 block text-[14px] font-medium text-gray-500">{field}</span>
              <span
                className={`flex h-[52px] items-center rounded-lg border px-4 text-[16px] ${
                  active ? "border-blue-500 bg-blue-50/50 text-gray-900" : "border-gray-300 bg-white text-gray-700"
                }`}
                style={{ boxShadow: active ? "0 0 0 3px rgba(37,99,235,0.16)" : undefined }}
              >
                <span style={{ opacity: filled > 0 ? 1 : 0.25 }}>{values[index]}</span>
                {active && filled > 0 && filled < 1 && (
                  <span className="ml-0.5 inline-block h-[18px] w-[2px] animate-pulse bg-blue-600" />
                )}
              </span>
            </label>
          );
        })}
        <div className="flex items-center gap-3 pt-1">
          <span
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 text-[15px] font-medium text-white"
            style={{
              opacity: t >= (fillAt[fillAt.length - 1] ?? 999) ? 1 : 0.55,
              transform: t >= (fillAt[fillAt.length - 1] ?? 999) ? "scale(1)" : "scale(0.98)",
            }}
          >
            <Check className="h-4 w-4" /> 提交订单
          </span>
          <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-[13px] font-medium text-gray-500">
            {values.filter((_, index) => t >= (fillAt[index] ?? 999)).length} / {fields.length} 已填
          </span>
        </div>
      </div>
    </FakeWindow>
  );
}

const FILE_ROWS = [
  { name: "Q4-plan.pdf", size: "2.0 MB", color: "#dc2626", icon: FileText },
  { name: "roadmap.png", size: "4.2 MB", color: "#2563eb", icon: FileImage },
  { name: "assets.zip", size: "27.8 MB", color: "#d97706", icon: FileArchive },
];

export function ExplorerWindow({
  t,
  selected,
  addedAt,
  style,
  className,
  highlightedName,
}: {
  t: number;
  selected: number[];
  addedAt?: number;
  style?: CSSProperties;
  className?: string;
  highlightedName?: string;
}) {
  return (
    <FakeWindow
      title="下载 — 文件资源管理器"
      style={style}
      className={className}
      accent="#d97706"
      icon={<Folder className="h-4 w-4" />}
    >
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-500">
          <Folder className="h-4 w-4 text-amber-500" /> <ChevronRight className="h-3 w-3" />
          <span>C:\Users\ming\Downloads</span>
        </div>
        <div className="space-y-1.5">
          {FILE_ROWS.map((file, index) => {
            const isSelected = selected.includes(index);
            const highlighted = highlightedName === file.name && t >= (addedAt ?? 999);
            const Icon = file.icon;
            return (
              <div
                key={file.name}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  highlighted
                    ? "border-blue-400 bg-blue-50"
                    : isSelected
                      ? "border-blue-300 bg-blue-50/70"
                      : "border-transparent bg-gray-50"
                }`}
                style={{
                  opacity: highlighted ? 1 : selected.length > 0 || highlightedName ? 1 : 0.9,
                  transform: highlighted ? "translateX(6px)" : "none",
                }}
              >
                <Icon className="h-5 w-5" style={{ color: file.color }} />
                <span className="text-[14px] font-medium text-gray-800">{file.name}</span>
                <span className="ml-auto text-[12px] text-gray-400">{file.size}</span>
                {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                {highlighted && <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">NEW</span>}
              </div>
            );
          })}
        </div>
      </div>
    </FakeWindow>
  );
}

/* ────────────────────────────── App panel ──────────────────────────────── */

const TAG_COLORS: Record<string, string> = Object.fromEntries(
  DEMO_TAGS.map((tag) => [tag.name.toLowerCase(), tag.color ?? "#0f6cbd"]),
);

const CARD_ACTIONS: CardActions = {
  onPaste: () => {},
  onDisablePrivacy: () => {},
  onOcrOpen: () => {},
  onOpenImage: () => {},
  onDragOutStart: async () => {},
  onMatchDragStart: () => {},
  onMatchDragEnd: () => {},
  onOpenMatchPanel: () => {},
  onContextMenu: () => {},
  onHover: () => {},
};

/**
 * A single real card, without the panel chrome. Used for close-ups where the
 * shell would eat the space the content needs.
 */
export function SingleCard({
  item,
  height = 480,
  selected = false,
}: {
  item: HistoryItem;
  height?: number;
  selected?: boolean;
}) {
  return (
    <div style={{ width: 320, height }} className="shrink-0">
      <ClipboardCard
        item={item}
        actions={CARD_ACTIONS}
        tagColors={TAG_COLORS}
        isSelected={selected}
        locale="zh-CN"
      />
    </div>
  );
}

/* ────────────────────────────── Small bits ─────────────────────────────── */

export function Badge({
  children,
  color = "#2563eb",
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold ${className ?? ""}`}
      style={{ backgroundColor: `${color}14`, color }}
    >
      {children}
    </span>
  );
}

export function Callout({
  t,
  at,
  icon,
  children,
  style,
  tone = "light",
}: {
  t: number;
  at: number;
  icon?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  tone?: "light" | "dark";
}) {
  return (
    <Reveal t={t} at={at} y={14} style={style}>
      <span
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[15px] font-medium shadow-lg ${
          tone === "dark" ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-white text-gray-700 ring-1 ring-gray-200"
        }`}
      >
        {icon}
        {children}
      </span>
    </Reveal>
  );
}

export function GhostChip({
  label,
  sublabel,
  style,
}: {
  label: string;
  sublabel?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className="pointer-events-none absolute flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 shadow-[0_16px_40px_rgba(37,99,235,0.28)]"
      style={style}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white">
        <FileText className="h-4 w-4" />
      </span>
      <span className="max-w-[240px]">
        <span className="block truncate text-[13px] font-semibold text-gray-900">{label}</span>
        {sublabel && <span className="block truncate text-[11px] text-gray-500">{sublabel}</span>}
      </span>
    </div>
  );
}

export function DeviceFrame({
  title,
  tone = "light",
  children,
  style,
  className,
}: {
  title: string;
  tone?: "light" | "dark";
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 shadow-2xl ${tone === "dark" ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white"} ${className ?? ""}`} style={style}>
      <div className={`mb-2 flex items-center gap-2 px-1 text-[12px] font-medium ${tone === "dark" ? "text-slate-400" : "text-gray-500"}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {title}
      </div>
      {children}
    </div>
  );
}

export function IconsRow({ items }: { items: Array<{ icon: ReactNode; label: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-600">
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  );
}

export const ICONS = {
  shield: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
  lock: <LockKeyhole className="h-4 w-4 text-red-600" />,
  tag: <Tag className="h-4 w-4 text-blue-600" />,
  wifi: <Wifi className="h-4 w-4 text-cyan-600" />,
  arrow: <ArrowRight className="h-4 w-4" />,
};
