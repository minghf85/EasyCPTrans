/**
 * The eleven shots.
 *
 * Each scene is a pure function of its local clock `t` (seconds since the shot
 * started) and its duration. Nothing is stateful and nothing relies on CSS
 * animations, which is what makes pausing and scrubbing exact.
 */

import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Cloud,
  CornerDownLeft,
  Download,
  FileText,
  GitBranch,
  Image as ImageIcon,
  ListOrdered,
  LockKeyhole,
  Monitor,
  MousePointer2,
  Regex,
  ScanText,
  Search,
  ShieldCheck,
  Tags,
  Wifi,
} from "lucide-react";

import type { HistoryItem } from "../../../src/types";
import { DEMO_ITEMS, SAMPLE_IMAGES } from "../demo/data";
import {
  Callout,
  CodeWindow,
  Cursor,
  DeviceFrame,
  ExplorerWindow,
  FakeWindow,
  FormWindow,
  GhostChip,
  KeyCombo,
  Keycap,
  Reveal,
  SingleCard,
  Typed,
  clamp01,
  easeInOut,
  easeOut,
  easeOutBack,
  progress,
  type CodeRow,
} from "./primitives";
import { PromoPanel } from "./PromoPanel";

export interface SceneProps {
  t: number;
  duration: number;
}

const byId = (id: number): HistoryItem => {
  const item = DEMO_ITEMS.find((entry) => entry.id === id);
  if (!item) throw new Error(`promo: missing demo item ${id}`);
  return item;
};

const PRIVATE_108: HistoryItem = {
  ...byId(108),
  isPrivate: true,
  tags: ["Private", "work", "todo"],
};

const UBIQUITOUS: HistoryItem = {
  id: 950,
  contentType: "text",
  content: `# ubiquitous

/juːˈbɪkwɪtəs/ · adjective

---

## 中文释义

- 无处不在的；普遍存在的
- 似乎到处都能见到的

## English

- present, appearing, or found everywhere

---

🏷 CET6 · Oxford 3000 · COCA 3120`,
  createdAt: null,
  lastUsedAt: null,
  useCount: 1,
  pinned: false,
  isPrivate: false,
  tags: ["Word"],
  metadata: {
    translationStatus: ["done"],
    wordQuery: ["ubiquitous"],
    sourceApp: ["article — Google Chrome"],
    appName: ["Chrome"],
    appPath: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"],
  },
};

const RULE_CARD: HistoryItem = {
  id: 951,
  contentType: "text",
  content: "PROJ-128",
  createdAt: null,
  lastUsedAt: null,
  useCount: 1,
  pinned: false,
  isPrivate: false,
  tags: ["work", "issue"],
  metadata: {
    length: ["8"],
    sourceApp: ["Triage — Linear"],
    appName: ["Linear"],
    appPath: ["C:\\Users\\ming\\AppData\\Local\\Programs\\Linear\\Linear.exe"],
    "tagMatch:issue": ["PROJ-128"],
    "tagMatchTotal:issue": ["1"],
  },
};

/**
 * A deliberately rich card for the interaction shot: enough text to scroll
 * vertically, enough tags to overflow the metadata row horizontally, and a
 * regex match stack to drag from.
 */
const RICH_ISSUE: HistoryItem = {
  ...byId(103),
  id: 952,
  content: `${byId(103).content}

Follow-up notes

- The card body is a real scroll container
- The metadata row scrolls sideways
- Tags and badges can overflow
- The match chips above are draggable
- Drag one onto the strip to create a card

Owner: minghf85`,
  tags: ["work", "issue", "design", "todo", "links", "Office-PC", "review"],
  metadata: {
    ...byId(103).metadata,
    length: ["520"],
    urls: ["https://github.com/minghf85/EasyCPTrans"],
  },
};

const EDGE_ROWS: CodeRow[] = [
  { text: "import { useState } from \"react\";", color: "#93c5fd" },
  { text: "" },
  { text: "export function useQueue(limit: number) {", color: "#c4b5fd" },
  { text: "const [items, setItems] = useState<string[]>([]);", indent: 1, color: "#e2e8f0" },
  { text: "" },
  { text: "// paste one card at a time", indent: 1, muted: true },
  { text: "function step() {", indent: 1, color: "#c4b5fd" },
  { text: "const [next, ...rest] = items;", indent: 2, color: "#e2e8f0" },
  { text: "setItems(rest);", indent: 2, color: "#e2e8f0" },
  { text: "return next;", indent: 2, color: "#fbbf24" },
  { text: "}", indent: 1, color: "#c4b5fd" },
  { text: "" },
  { text: "return { items, step, enqueue: (value: string) =>", indent: 1, color: "#e2e8f0" },
  { text: "setItems((current) => [...current, value]) };", indent: 2, color: "#e2e8f0" },
  { text: "}", color: "#c4b5fd" },
];

const INSERTED_ROWS: CodeRow[] = [
  { text: "Bug triage — clipboard", color: "#fca5a5" },
  { text: "" },
  { text: "PROJ-128  a copied file is stored twice", color: "#fde68a" },
  { text: "PROJ-233  the drag step needs a file or image card", color: "#fde68a" },
  { text: "PROJ-241  the settings tab spinner never resets", color: "#fde68a" },
];

const ARTICLE_ROWS: CodeRow[] = [
  { text: "# Designing for the everyday", color: "#c4b5fd" },
  { text: "" },
  { text: "Modern editors make the ordinary feel light.", color: "#e2e8f0" },
  { text: "The update is ubiquitous in modern editors,", color: "#e2e8f0" },
  { text: "and nobody notices how much it saves.", color: "#e2e8f0" },
  { text: "" },
  { text: "1. Copy the fragment", color: "#93c5fd" },
  { text: "2. Search it later", color: "#93c5fd" },
  { text: "3. Paste it back", color: "#93c5fd" },
];

/* ────────────────────────────── 01 · Hook ──────────────────────────────── */

export function HookScene({ t }: SceneProps) {
  const dim = easeOut(progress(t, 1.5, 0.9));
  const title = easeOut(progress(t, 3.2, 0.8));
  const questionOpacity =
    progress(t, 0.8, 0.5) * (1 - progress(t, 1.7, 0.5));

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b1220] text-white">
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.25) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[900px] w-[1500px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(37,99,235,0.25), rgba(37,99,235,0.06) 45%, transparent 70%)",
        }}
      />

      {/* Pinned chips drifting at the edges. */}
      {[
        { label: "#work", x: 120, y: 180, phase: 0 },
        { label: "PROJ-128", x: 1600, y: 120, phase: 1.4 },
        { label: "OCR", x: 120, y: 820, phase: 2.4 },
        { label: "Alt + C", x: 1580, y: 840, phase: 3.1 },
      ].map((chip) => (
        <span
          key={chip.label}
          className="absolute rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[14px] font-medium text-white/45"
          style={{ left: chip.x, top: chip.y, transform: `translateY(${Math.sin(t * 0.8 + chip.phase) * 7}px)` }}
        >
          {chip.label}
        </span>
      ))}

      <div
        className="absolute"
        style={{
          left: 1040,
          top: 230,
          opacity: 1 - dim * 0.62,
          transform: `scale(${1 - dim * 0.04}) translateY(${dim * 10}px)`,
        }}
      >
        <FakeWindow title="notes.md — Notepad" compact style={{ width: 720, height: 470 }}>
          <div className="space-y-3 p-8 font-mono text-[15px] leading-8 text-gray-600">
            <div className="text-gray-400"># Release notes</div>
            <div>- Ship the onboarding tour</div>
            <div>- Cut the duplicate-file bug</div>
            <div
              className="rounded-lg border-2 border-dashed px-4 py-3 text-[15px]"
              style={{
                borderColor: `rgba(148,163,184,${0.25 + dim * 0.4})`,
                color: `rgba(100,116,139,${0.75 - dim * 0.35})`,
                backgroundColor: `rgba(241,245,249,${dim * 0.6})`,
              }}
            >
              刚才复制的那段…
            </div>
            <div>- Publish the new website</div>
          </div>
        </FakeWindow>
      </div>

      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="absolute flex h-14 w-14 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10 text-[26px] font-semibold text-blue-300"
          style={{
            left: 1040 + index * 240,
            top: 120 + (index % 2) * 470,
            opacity: questionOpacity,
            transform: `translateY(${Math.sin(t * 2 + index) * 8}px) scale(${0.8 + questionOpacity * 0.2})`,
          }}
        >
          ?
        </span>
      ))}

      <div className="absolute left-[170px] top-[250px]">
        <Reveal t={t} at={0.4} y={16}>
          <span className="inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-[14px] font-medium tracking-wide text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            WINDOWS · LOCAL-FIRST · TAURI 2
          </span>
        </Reveal>

        <div className="mt-7 text-[86px] font-semibold leading-[1.05] tracking-[-0.03em]">
          <div style={{ opacity: title, transform: `translateY(${(1 - title) * 28}px)` }}>复制过的，</div>
          <div
            className="text-blue-400"
            style={{
              opacity: easeOut(progress(t, 3.5, 0.8)),
              transform: `translateY(${(1 - easeOut(progress(t, 3.5, 0.8))) * 28}px)`,
            }}
          >
            都在这里。
          </div>
        </div>

        <div
          className="mt-2 h-[3px] rounded-full bg-blue-500"
          style={{ width: 420 * easeOut(progress(t, 4.1, 0.9)), opacity: progress(t, 4.1, 0.2) }}
        />

        <div className="mt-12">
          <KeyCombo keys={["Ctrl", "Shift", "V"]} t={t} showAt={2.0} pressAt={4.7} tone="dark" />
        </div>

        <Reveal t={t} at={5.5} y={12}>
          <div className="mt-8 flex items-center gap-3 text-white/55">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ClipboardGlyph />
            </span>
            <span className="text-[20px] font-semibold tracking-tight text-white/85">EasyCPTrans</span>
            <span className="text-[13px]">剪贴板历史与划词翻译</span>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function ClipboardGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <rect x="5" y="4" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="2.5" width="6" height="4" rx="1.5" fill="currentColor" />
      <path d="M8.5 11h7M8.5 14.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ────────────────────────────── 02 · Summon ────────────────────────────── */

export function SummonScene({ t }: SceneProps) {
  const panelP = easeOutBack(progress(t, 2.4, 0.6));
  const cursorX = 1520;
  const cursorY = 780;

  return (
    <DesktopStage>
      <div className="absolute left-[90px] top-[46px] opacity-90">
        <CodeWindow
          t={t}
          title="useClipboardWatcher.ts — Visual Studio Code"
          rows={EDGE_ROWS}
          style={{ width: 1180, height: 740 }}
        />
      </div>
      <div className="absolute left-[1320px] top-[100px] opacity-80">
        <FakeWindow title="New Tab — Google Chrome" style={{ width: 480, height: 620 }} accent="#0ea5e9" icon={<Search className="h-4 w-4" />}>
          <div className="space-y-4 p-6">
            <div className="h-10 rounded-full bg-gray-100" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-24 rounded-lg bg-slate-100" />
              ))}
            </div>
          </div>
        </FakeWindow>
      </div>

      <div
        className="absolute left-[330px] top-[250px]"
        style={{
          opacity: panelP,
          transform: `translate3d(0, ${(1 - panelP) * 30}px, 0) scale(${0.9 + panelP * 0.1})`,
          transformOrigin: "50% 20%",
        }}
      >
        <PromoPanel
          t={t}
          items={[RICH_ISSUE, byId(108), byId(110), byId(101)]}
          width={1480}
          height={610}
          selectedId={t >= 5.2 ? 110 : undefined}
          cardRevealAt={2.9}
          cardStagger={0.12}
          showPageNav
        />
      </div>

      <div className="absolute left-[620px] top-[890px] flex items-center gap-6">
        <KeyCombo keys={["Ctrl", "Shift", "V"]} t={t} showAt={0.9} pressAt={2.0} />
        <Reveal t={t} at={1.3} x={-12} y={0}>
          <div className="text-[15px] text-gray-500">
            <span className="font-semibold text-gray-800">在任何应用里</span>唤出面板
          </div>
        </Reveal>
      </div>

      <Cursor
        t={t}
        points={[
          { at: 0, x: 1780, y: 1010 },
          { at: 1.6, x: cursorX, y: cursorY },
          { at: 3.4, x: 1420, y: 700 },
          { at: 6.0, x: 980, y: 640 },
          { at: 9.4, x: 930, y: 660 },
        ]}
        clicks={[9.2]}
      />

      <Reveal t={t} at={4.4} y={10} style={{ position: "absolute", left: 360, top: 900 }}>
        <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[13px] font-medium text-blue-700">
          面板跟着光标出现 · 卡片按最新排序
        </span>
      </Reveal>
    </DesktopStage>
  );
}

/* ────────────────────────────── 03 · UI interactions ───────────────────── */

const UI_LABELS = [
  { at: 0.8, text: "鼠标移过卡片 → 轻微 3D 倾斜" },
  { at: 2.2, text: "在正文上滚动 → 内容纵向滚动" },
  { at: 4.2, text: "在 metadata 行滚动 → 标签横向滚动" },
  { at: 6.2, text: "在卡片带上滚动 → 横向切换卡片" },
  { at: 8.2, text: "点导航栏箭头 → 标签栏横向滚动" },
  { at: 10.2, text: "点击卡片 → 粘贴回原窗口" },
];

/**
 * The interaction shot: the camera stays put while the real containers move.
 *
 * The panel below is the real replica — same nav tokens, same card component,
 * same scroll containers. `tilt` applies the exact transform `useCardTilt`
 * produces, and the scroll values are written straight into the DOM nodes the
 * app scrolls.
 */
export function UiScene({ t }: SceneProps) {
  const labelIndex =
    t < 2.2 ? 0 : t < 4.2 ? 1 : t < 6.2 ? 2 : t < 8.2 ? 3 : t < 10.2 ? 4 : 5;
  const label = UI_LABELS[labelIndex];

  const overCard = (t >= 0.9 && t < 6.2) || t >= 10.2;
  const tiltIndex = t >= 10.2 ? 2 : 0;
  const tiltY = t >= 10.2 ? 0.42 : t < 2.2 ? 0.34 + progress(t, 0.9, 1.3) * 0.1 : t < 4.2 ? 0.46 : 0.86;

  return (
    <DesktopStage>
      <div className="absolute left-[210px] top-[120px]">
        <PromoPanel
          t={t}
          items={[RICH_ISSUE, byId(108), byId(110), byId(101), byId(114)]}
          width={1500}
          height={700}
          activeTab="all"
          selectedId={t >= 10.2 ? 110 : RICH_ISSUE.id}
          cardRevealAt={0}
          cardStripScroll={progress(t, 6.3, 1.8) * 0.65}
          tabScroll={progress(t, 8.3, 1.8) * 0.9}
          contentScroll={{ index: 0, value: progress(t, 2.2, 1.6) }}
          metadataScroll={{ index: 0, value: progress(t, 4.2, 1.6) }}
          tilt={overCard ? { index: tiltIndex, x: 0.5, y: tiltY } : null}
          showPageNav
        />
      </div>

      <div className="absolute left-1/2 top-[870px] -translate-x-1/2">
        <Reveal key={labelIndex} t={t} at={label.at} y={10}>
          <span className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-[15px] font-medium text-gray-700 shadow-lg">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            {label.text}
          </span>
        </Reveal>
      </div>

      <Cursor
        t={t}
        points={[
          { at: 0, x: 1770, y: 990 },
          { at: 0.9, x: 398, y: 420 },
          { at: 2.3, x: 398, y: 520 },
          { at: 4.3, x: 398, y: 750 },
          { at: 6.3, x: 820, y: 610 },
          { at: 8.3, x: 1560, y: 146 },
          { at: 9.8, x: 1560, y: 146 },
          { at: 10.4, x: 734, y: 500 },
        ]}
        clicks={[8.3, 10.4]}
      />
    </DesktopStage>
  );
}

function DesktopStage({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#eef2f7] text-gray-900">
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(100,116,139,0.28) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
      {children}
    </div>
  );
}

/* ────────────────────────────── 03 · Paste ─────────────────────────────── */

export function PasteScene({ t }: SceneProps) {
  const panelOut = easeOut(progress(t, 8.6, 0.8));
  const ghostP = easeInOut(progress(t, 3.0, 0.75));
  const start = { x: 980, y: 830 };
  const end = { x: 660, y: 430 };
  const ghost = {
    x: start.x + (end.x - start.x) * ghostP + Math.sin(ghostP * Math.PI) * -40,
    y: start.y + (end.y - start.y) * ghostP + Math.sin(ghostP * Math.PI) * -120,
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#eef2f7] text-gray-900">
      <div className="absolute left-[60px] top-[46px]">
        <CodeWindow
          t={t}
          title="product-spec.md — Visual Studio Code"
          rows={EDGE_ROWS}
          insertedRows={INSERTED_ROWS}
          insertAt={3.7}
          sweepAt={3.9}
          style={{ width: 1800, height: 900 }}
        />
      </div>

      <div
        className="absolute left-[820px] top-[580px]"
        style={{ opacity: 1 - panelOut, transform: `translateY(${panelOut * 70}px)` }}
      >
        <PromoPanel
          t={t}
          items={[byId(108), RICH_ISSUE, byId(101)]}
          width={1040}
          height={390}
          selectedId={t >= 2.6 ? RICH_ISSUE.id : undefined}
          cardRevealAt={0.2}
          cardStagger={0.08}
        />
      </div>

      {t >= 2.9 && t < 4.0 && (
        <GhostChip
          label="PROJ-128 · a copied file is stored twice"
          sublabel="issue card → 编辑器光标位置"
          style={{ left: ghost.x, top: ghost.y, opacity: 1 - progress(t, 3.9, 0.2) }}
        />
      )}

      <Cursor
        t={t}
        points={[
          { at: 0, x: 1660, y: 940 },
          { at: 1.2, x: 1080, y: 830 },
          { at: 2.6, x: 1000, y: 820 },
          { at: 4.2, x: 760, y: 520 },
        ]}
        clicks={[2.6]}
      />

      <div className="absolute left-[120px] top-[1000px] flex items-center gap-3">
        <Callout t={t} at={5.0} icon={<MousePointer2 className="h-4 w-4 text-blue-600" />}>
          点击 = 写入剪贴板 + 粘贴回上一个窗口
        </Callout>
        <Callout t={t} at={5.8} icon={<CornerDownLeft className="h-4 w-4 text-gray-500" />}>
          Enter = 只复制，不粘贴
        </Callout>
      </div>

      <Reveal t={t} at={6.6} y={12} style={{ position: "absolute", left: 120, top: 960 }}>
        <div className="text-[13px] font-medium uppercase tracking-[0.18em] text-blue-600">paste back</div>
      </Reveal>
    </div>
  );
}

/* ────────────────────────────── 04 · Media ─────────────────────────────── */

export function MediaScene({ t }: SceneProps) {
  const beat = t < 3.9 ? 0 : t < 7.5 ? 1 : 2;
  const selection = easeInOut(progress(t, 0.4, 1.4));
  const cursorStart = { x: 1290, y: 520 };
  const cursorEnd = { x: 620, y: 430 };
  const drag = easeInOut(progress(t, 7.8, 2.4));
  const cursor = {
    x: cursorStart.x + (cursorEnd.x - cursorStart.x) * drag,
    y: cursorStart.y + (cursorEnd.y - cursorStart.y) * drag,
  };

  const items =
    beat === 0
      ? [byId(106), byId(105)]
      : [byId(107), byId(106)];

  return (
    <DesktopStage>
      <div className="absolute left-[100px] top-[80px]">
        {beat === 0 ? (
          <div className="relative">
            <FakeWindow
              title="dashboard.png — 照片"
              style={{ width: 900, height: 610 }}
              accent="#2563eb"
              icon={<ImageIcon className="h-4 w-4" />}
            >
              <img src={SAMPLE_IMAGES[106]} alt="" className="h-full w-full object-cover" />
            </FakeWindow>
            <div
              className="pointer-events-none absolute border-2 border-dashed border-blue-500 bg-blue-500/5"
              style={{
                left: 90 + selection * 40,
                top: 120 + selection * 40,
                width: 600 - selection * 40,
                height: 380 - selection * 40,
                borderRadius: 8,
                opacity: t < 3.4 ? 1 : 1 - progress(t, 3.4, 0.4),
                boxShadow: "0 0 0 9999px rgba(15,23,42,0.18)",
              }}
            >
              <span className="absolute -top-9 left-0 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">
                截图 · 1200 × 760
              </span>
            </div>
            <div
              className="pointer-events-none absolute inset-0 bg-white"
              style={{ opacity: t >= 3.2 ? 1 - progress(t, 3.2, 0.35) : 0 }}
            />
          </div>
        ) : (
          <ExplorerWindow
            t={t}
            selected={beat === 1 ? [0, 1, 2] : [1]}
            addedAt={10.2}
            highlightedName="roadmap.png"
            style={{ width: 900, height: 610 }}
          />
        )}
      </div>

      <div className="absolute left-[1090px] top-[130px]">
        <PromoPanel
          t={t}
          items={items}
          width={750}
          height={740}
          activeTab={beat === 0 ? "image" : "file"}
          selectedId={beat === 0 ? 106 : 107}
          cardRevealAt={beat === 0 ? 3.1 : 4.4}
          cardStagger={0.12}
        />
      </div>

      {beat === 2 && t >= 7.7 && t < 10.4 && (
        <GhostChip
          label="dashboard.png"
          sublabel="image · 1200 × 760"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: "translate(-50%, -50%) scale(1.05)",
            opacity: 1 - progress(t, 10.1, 0.3),
          }}
        />
      )}

      <Cursor
        t={t}
        points={[
          { at: 0, x: 1720, y: 900 },
          { at: 1.0, x: 1250, y: 620 },
          { at: 3.8, x: 1200, y: 560 },
          { at: 5.0, x: 700, y: 480 },
          { at: 7.2, x: 1260, y: 520 },
          { at: 10.4, x: 650, y: 430 },
        ]}
        clicks={[3.0, 6.0, 10.2]}
        visibleTo={10.4}
      />

      <div className="absolute left-[150px] top-[820px] flex gap-3">
        <MediaTag t={t} at={0.3} active={beat === 0} icon={<ImageIcon className="h-4 w-4" />}>
          截图 → 图片卡片
        </MediaTag>
        <MediaTag t={t} at={0.3} active={beat === 1} icon={<FileText className="h-4 w-4" />}>
          多选文件 → 文件卡片
        </MediaTag>
        <MediaTag t={t} at={0.3} active={beat === 2} icon={<ArrowRight className="h-4 w-4" />}>
          拖出 → 资源管理器
        </MediaTag>
      </div>

      <Reveal t={t} at={10.6} y={10} style={{ position: "absolute", left: 150, top: 900 }}>
        <span className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg">
          <Check className="h-4 w-4" /> roadmap.png 已落地，原文件不被移动
        </span>
      </Reveal>
    </DesktopStage>
  );
}

function MediaTag({
  t,
  at,
  active,
  icon,
  children,
}: {
  t: number;
  at: number;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Reveal t={t} at={at} y={10}>
      <span
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
          active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white/70 text-gray-400"
        }`}
      >
        {icon}
        {children}
      </span>
    </Reveal>
  );
}

/* ────────────────────────────── 05 · Search ────────────────────────────── */

const SEARCH_QUERY = "app:code tag:work PROJ";

export function SearchScene({ t }: SceneProps) {
  const typedCount = Math.max(0, Math.floor((t - 1.2) * 13));
  const query = SEARCH_QUERY.slice(0, typedCount);
  const tagBeat = t >= 9.2;

  let items: HistoryItem[];
  let count: number;
  if (tagBeat) {
    items = [byId(114), byId(108)];
    count = 2;
  } else if (typedCount >= SEARCH_QUERY.length) {
    items = [byId(103)];
    count = 1;
  } else if (typedCount >= 15) {
    items = [byId(108), byId(103), byId(101), byId(110)];
    count = 4;
  } else if (typedCount >= 9) {
    items = [byId(108), byId(103), byId(101), byId(110)];
    count = 14;
  } else {
    items = [byId(108), byId(103), byId(101), byId(110)];
    count = 58;
  }

  const fields = ["tag", "app", "type", "date", "size", "len"];

  return (
    <DesktopStage>
      <div className="absolute left-[230px] top-[150px]">
        <PromoPanel
          t={t}
          items={items}
          width={1460}
          height={700}
          activeTab={tagBeat ? "tags" : "all"}
          selectedId={tagBeat ? undefined : 103}
          searchOpen={!tagBeat}
          search={
            tagBeat ? (
              <span className="text-gray-400">标签筛选 · AND</span>
            ) : (
              <Typed text={SEARCH_QUERY} t={t} at={1.2} cps={13} caretClassName="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[3px] bg-blue-600" />
            )
          }
          tagSelectorOpen={tagBeat}
          activeTags={tagBeat ? ["work", "design"] : []}
          tabScroll={tagBeat ? 1 : 0}
          cardRevealAt={tagBeat ? 9.2 : 0.2}
          cardStagger={0.1}
        />
      </div>

      <div className="absolute left-[230px] top-[900px] flex items-center gap-2">
        <span className="mr-2 text-[13px] font-medium text-gray-500">语法</span>
        {fields.map((field, index) => {
          const used = !tagBeat && query.includes(`${field}:`);
          return (
            <Reveal key={field} t={t} at={0.6 + index * 0.07} y={8}>
              <span
                className={`rounded-lg border px-2.5 py-1 font-mono text-[12px] font-medium ${
                  used ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                {field}:
              </span>
            </Reveal>
          );
        })}
        <Reveal t={t} at={1.0} x={10} y={0}>
          <span className="ml-2 text-[13px] text-gray-500">多个条件可以任意组合</span>
        </Reveal>
      </div>

      <div
        className="absolute right-[120px] top-[930px] flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5"
        style={{ opacity: progress(t, 4.8, 0.4) }}
      >
        <Search className="h-4 w-4 text-blue-600" />
        <span className="text-[13px] font-semibold text-blue-700">
          {tagBeat ? "work AND design" : `“${SEARCH_QUERY}”`} → {count} 条
        </span>
      </div>

      {tagBeat && (
        <Reveal t={t} at={10.4} y={10} style={{ position: "absolute", left: 900, top: 900 }}>
          <span className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 shadow ring-1 ring-gray-200">
            AND：同时满足 work 与 design
          </span>
        </Reveal>
      )}

      <Cursor
        t={t}
        points={[
          { at: 0, x: 1700, y: 980 },
          { at: 1.0, x: 1560, y: 300 },
          { at: 5.2, x: 1180, y: 330 },
          { at: 8.8, x: 500, y: 380 },
          { at: 9.4, x: 440, y: 390 },
        ]}
        clicks={[9.4]}
      />
    </DesktopStage>
  );
}

/* ────────────────────────────── 06 · Rules ─────────────────────────────── */

const RULE_PATTERN = "[A-Z]+-\\d+";
const RULE_LINES = [
  "PROJ-128  a copied file is stored twice",
  "PROJ-233  the drag step needs a file or image card",
  "PROJ-241  the settings tab spinner never resets",
  "PROJ-262  tag rules should scan OCR text",
  "PROJ-277  queue paste should keep the panel open",
];

export function RulesScene({ t }: SceneProps) {
  const patternCount = Math.max(0, Math.floor((t - 1.4) * 7));
  const matched = patternCount >= RULE_PATTERN.length;
  const matchesShown = Math.min(5, Math.floor(progress(t, 4.0, 0.9) * 5));
  const drag = easeInOut(progress(t, 5.0, 1.7));
  const ghost = { x: 470 + (940 - 470) * drag, y: 560 + (520 - 560) * drag };

  return (
    <DesktopStage>
      <div className="absolute left-[70px] top-[200px]">
        <PromoPanel
          t={t}
          items={t >= 9.0 ? [RULE_CARD, RICH_ISSUE] : [RICH_ISSUE, byId(101)]}
          width={1020}
          height={680}
          activeTab="all"
          selectedId={t >= 9.0 ? RULE_CARD.id : RICH_ISSUE.id}
          openMatchStackAt={2.8}
          cardRevealAt={0.2}
          cardStagger={0.1}
        />
      </div>

      <div className="absolute left-[1140px] top-[120px] w-[680px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-3">
          <Regex className="h-4 w-4 text-blue-600" />
          <span className="text-[15px] font-semibold text-gray-900">#issue · 规则</span>
          <span className="ml-auto rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Tag Admin</span>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-gray-500">正则</div>
            <div className="flex h-12 items-center rounded-lg border border-blue-400 bg-white px-3 font-mono text-[16px] text-gray-800">
              <Typed text={RULE_PATTERN} t={t} at={1.0} cps={7} caretClassName="ml-0.5 inline-block h-[18px] w-[2px] bg-blue-600" />
            </div>
          </div>
          <div className="flex items-center gap-4 text-[13px] text-gray-600">
            <span className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-2.5 py-1.5">
              <span className={`h-4 w-8 rounded-full ${matched ? "bg-blue-600" : "bg-gray-300"}`}>
                <span className={`block h-3.5 w-3.5 translate-y-[1px] rounded-full bg-white ${matched ? "translate-x-[17px]" : "translate-x-[2px]"}`} />
              </span>
              抽取匹配项
            </span>
            <span className="text-gray-400">忽略大小写：关</span>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-gray-500">
              最近 200 条试跑
              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                {matched ? Math.min(5, matchesShown + (matchesShown > 0 ? 0 : 0)) : 0} 处匹配
              </span>
            </div>
            <div className="space-y-1.5 font-mono text-[12px] leading-5 text-gray-500">
              {RULE_LINES.map((line, index) => {
                const shown = matched && index < matchesShown;
                return (
                  <div key={line} className={shown ? "text-gray-800" : "text-gray-400"}>
                    {shown ? (
                      <>
                        <span className="rounded bg-amber-200/80 px-0.5 text-amber-900">{line.slice(0, 8)}</span>
                        {line.slice(8)}
                      </>
                    ) : (
                      line
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between text-[12px] text-gray-500">
            <span>保存后，新内容入库时自动打标</span>
            <span className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white">保存规则</span>
          </div>
        </div>
      </div>

      {t >= 5.0 && t < 8.9 && (
        <GhostChip
          label="PROJ-128"
          sublabel="#issue 文字匹配项 → 拖到卡片带生成新卡"
          style={{ left: ghost.x, top: ghost.y, opacity: 1 - progress(t, 8.6, 0.25) }}
        />
      )}

      <Cursor
        t={t}
        points={[
          { at: 0, x: 1760, y: 960 },
          { at: 1.6, x: 1400, y: 300 },
          { at: 2.8, x: 450, y: 470 },
          { at: 5.0, x: 470, y: 560 },
          { at: 8.3, x: 940, y: 520 },
        ]}
        clicks={[2.8, 8.6]}
        visibleTo={9.0}
      />

      <Reveal t={t} at={9.2} y={10} style={{ position: "absolute", left: 900, top: 930 }}>
        <span className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg">
          匹配项可以直接拖成一张新卡片
        </span>
      </Reveal>
    </DesktopStage>
  );
}

/* ────────────────────────────── 07 · OCR / translate ───────────────────── */

const OCR_TEXT =
  "error TS2307: Cannot find module '@tauri-apps/api/core'\n  at ingestClipboard (commands.rs:1217)\n\n→ check the watcher import";

export function OcrScene({ t }: SceneProps) {
  const scan = easeInOut(progress(t, 1.0, 2.6));
  const ocrCount = Math.max(0, Math.min(OCR_TEXT.length, Math.floor((t - 2.0) * 34)));
  const wordSelect = progress(t, 6.2, 0.35);
  const cardIn = easeOut(progress(t, 7.4, 0.6));
  const showTranslation = t >= 7.2;

  return (
    <DesktopStage>
      <div
        className="absolute left-[130px] top-[150px] w-[820px]"
        style={{ opacity: 1 - progress(t, 6.2, 0.55) * 0.15 }}
      >
        <FakeWindow
          title="Screenshot — Snipping Tool"
          style={{ width: 760, height: 460 }}
          accent="#0ea5e9"
          icon={<ScanText className="h-4 w-4" />}
        >
          <div className="relative h-full">
            <img src={SAMPLE_IMAGES[105]} alt="" className="h-full w-full object-cover" />
            <div
              className="pointer-events-none absolute left-0 right-0 h-[3px] bg-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.9)]"
              style={{ top: `${scan * 100}%`, opacity: t < 3.7 ? 1 : 1 - progress(t, 3.7, 0.3) }}
            />
            <div className="pointer-events-none absolute inset-0 border-2 border-cyan-400/60" style={{ opacity: t < 3.7 ? 1 : 0 }} />
          </div>
        </FakeWindow>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-xl" style={{ width: 760 }}>
          <div className="mb-2 flex items-center gap-2">
            <ScanText className="h-4 w-4 text-blue-600" />
            <span className="text-[13px] font-semibold text-gray-900">OCR 识别结果</span>
            <span className="ml-auto rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              {ocrCount} chars
            </span>
            <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">en-US</span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-6 text-gray-700">
            {OCR_TEXT.slice(0, ocrCount)}
            {ocrCount > 0 && ocrCount < OCR_TEXT.length && <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[3px] bg-blue-600" />}
          </pre>
          {t >= 4.2 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1 text-[12px] font-semibold text-green-700">
                <Check className="h-3.5 w-3.5" /> 已写入 metadata · 可搜索
              </span>
              <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-[12px] font-medium text-gray-500">图片本身无需联网</span>
            </div>
          )}
        </div>
      </div>

      <div className="absolute left-[1040px] top-[130px]">
        <CodeWindow
          t={t}
          title="designing-for-everyday.md — Visual Studio Code"
          rows={ARTICLE_ROWS}
          selectedWord={showTranslation ? "ubiquitous" : undefined}
          selectAt={6.2}
          style={{ width: 760, height: 500 }}
        />
      </div>

      <div className="absolute left-[1220px] top-[560px] flex items-center gap-5">
        <KeyCombo keys={["Alt", "C"]} t={t} showAt={5.8} pressAt={7.0} size="sm" />
        <Reveal t={t} at={6.0} y={8}>
          <span className="text-[13px] text-gray-500">划词翻译</span>
        </Reveal>
      </div>

      {showTranslation && (
        <div
          className="absolute left-[1400px] top-[470px] origin-top-left"
          style={{ opacity: cardIn, transform: `translateY(${(1 - cardIn) * 30}px) scale(${1.08 * (0.96 + cardIn * 0.04)})` }}
        >
          <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <SingleCard item={UBIQUITOUS} height={480} selected />
          </div>
        </div>
      )}

      {wordSelect > 0 && (
        <Reveal t={t} at={6.4} y={10} style={{ position: "absolute", left: 1060, top: 400 }}>
          <span className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 shadow ring-1 ring-gray-200">
            选中 ubiquitous · 音标 / 释义 / 标签一次到位
          </span>
        </Reveal>
      )}

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-cyan-100/60 to-transparent"
        style={{
          opacity: t >= 5.9 && t < 6.4 ? Math.sin(((t - 5.9) / 0.5) * Math.PI) : 0,
          transform: `translateX(${-30 + progress(t, 5.9, 0.5) * 60}%)`,
        }}
      />
    </DesktopStage>
  );
}

/**
 * The real card, pinned to a known size. Used in the OCR shot where a full panel
 * would be too much furniture.
 */

/* ────────────────────────────── 08 · Queue ─────────────────────────────── */

const FORM_FIELDS = ["客户姓名", "邮箱", "订单号", "备注"];
const FORM_VALUES = ["林砚", "lin@studio.dev", "PROJ-233", "按约定周五交付"];

export function QueueScene({ t }: SceneProps) {
  const queue: Record<number, number> = {};
  if (t >= 1.2) queue[101] = 1;
  if (t >= 2.4) queue[103] = 2;
  if (t >= 3.6) queue[114] = 3;
  const fillAt = [5.2, 6.6, 8.0, 8.0];
  const active = t >= 8.0 ? -1 : t >= 6.6 ? 2 : t >= 5.2 ? 1 : t >= 3.6 ? 0 : -1;
  const pressed = [1.2, 2.4, 3.6, 5.2, 6.6, 8.0].some((at) => t >= at && t < at + 0.3);

  return (
    <DesktopStage>
      <div className="absolute left-[150px] top-[90px]">
        <FormWindow
          t={t}
          fields={FORM_FIELDS}
          values={FORM_VALUES}
          fillAt={fillAt}
          activeIndex={active}
          style={{ width: 820, height: 560 }}
        />
      </div>

      <div className="absolute left-[1050px] top-[110px] w-[720px] rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-blue-600" />
          <span className="text-[14px] font-semibold text-gray-900">队列</span>
          <span className="ml-auto rounded-lg bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
            {Object.keys(queue).length} / 3 已入队
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { slot: 1, text: "Release checklist — 发布前检查", id: 101 },
            { slot: 2, text: "PROJ-128 · copied file stored twice", id: 103 },
            { slot: 3, text: "设计稿已放到共享盘…", id: 114 },
          ].map((row) => {
            const ready = queue[row.id] !== undefined;
            return (
              <div
                key={row.slot}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px] ${
                  ready ? "border-green-300 bg-green-50/70 text-gray-800" : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                    ready ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"
                  }`}
                >
                  Q{row.slot}
                </span>
                <span className="truncate">{row.text}</span>
                {ready && <Check className="ml-auto h-4 w-4 text-green-600" />}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3 text-[12px] text-gray-500">
          <Keycap label="Space" size="sm" pressed={pressed && t < 4.2} />
          加入 / 移出队列
        </div>
      </div>

      <div className="absolute left-[180px] top-[660px]">
        <PromoPanel
          t={t}
          items={[byId(101), byId(103), byId(114)]}
          width={1500}
          height={340}
          activeTab="all"
          queue={queue}
          cardRevealAt={0.2}
          cardStagger={0.08}
        />
      </div>

      <div className="absolute left-[1500px] top-[560px] flex flex-col items-center gap-3">
        <KeyCombo keys={["Ctrl", "Alt", "V"]} t={t} showAt={4.2} pressAt={5.2} size="sm" gap={8} />
        <span className="text-[12px] font-medium text-gray-500">按队列顺序逐条粘贴</span>
      </div>

      <div className="absolute left-[430px] top-[1010px]">
        <Reveal t={t} at={8.6} y={8}>
          <span className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-lg">
            <Check className="h-4 w-4" /> 3 / 3 已粘贴 · 表单可以直接提交
          </span>
        </Reveal>
      </div>
    </DesktopStage>
  );
}

/* ────────────────────────────── 09 · Private ───────────────────────────── */

export function PrivateScene({ t }: SceneProps) {
  const locked = t >= 2.6;
  const blur = easeOut(progress(t, 2.6, 0.6));
  const dots = Math.max(0, Math.min(6, Math.floor((t - 3.1) * 2.6)));
  const cardItems = locked ? [PRIVATE_108, byId(109), byId(101)] : [byId(108), byId(109), byId(101)];

  return (
    <DesktopStage>
      <div className="absolute left-[330px] top-[190px]">
        <PromoPanel
          t={t}
          items={cardItems}
          width={1240}
          height={600}
          activeTab="all"
          selectedId={108}
          cardRevealAt={0.2}
          cardStagger={0.08}
        />
      </div>

      {t < 3.0 && (
        <div
          className="absolute w-[290px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-[0_24px_60px_rgba(15,23,42,0.24)]"
          style={{
            left: 790,
            top: 420,
            opacity: progress(t, 0.8, 0.3),
            transform: `translateY(${(1 - progress(t, 0.8, 0.3)) * 12}px) scale(${0.98 + progress(t, 0.8, 0.3) * 0.02})`,
          }}
        >
          {[
            { label: "粘贴", key: "Enter" },
            { label: "复制", key: "" },
            { label: "置顶", key: "P" },
            { label: "设为私密", key: "M", active: true },
            { label: "删除", key: "Delete", danger: true },
          ].map((row) => (
            <div
              key={row.label}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] ${
                row.active ? "bg-blue-600 font-semibold text-white" : row.danger ? "text-red-600" : "text-gray-700"
              }`}
            >
              <span className="flex items-center gap-2">
                {row.label === "设为私密" && <LockKeyhole className="h-4 w-4" />}
                {row.label}
              </span>
              {row.key && <span className={row.active ? "font-mono text-white/80" : "font-mono text-gray-400"}>{row.key}</span>}
            </div>
          ))}
        </div>
      )}

      {locked && (
        <div
          className="absolute left-[1330px] top-[300px] w-[410px] rounded-xl border border-gray-200 bg-white p-6 shadow-[0_30px_70px_rgba(15,23,42,0.24)]"
          style={{ opacity: blur, transform: `translateY(${(1 - blur) * 24}px)` }}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <LockKeyhole className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[15px] font-semibold text-gray-900">设置隐私密码</div>
              <div className="text-[11px] text-gray-500">AES-GCM · Argon2id</div>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <span
                key={index}
                className={`flex h-11 flex-1 items-center justify-center rounded-lg border text-[20px] ${
                  index < dots ? "border-gray-300 bg-gray-50 text-gray-800" : "border-gray-200 bg-white"
                }`}
              >
                {index < dots ? "•" : ""}
              </span>
            ))}
          </div>
          <div
            className="mt-4 flex h-10 items-center justify-center rounded-lg bg-blue-600 text-[13px] font-semibold text-white"
            style={{ opacity: dots >= 6 ? 1 : 0.55 }}
          >
            加密并保存
          </div>
          <div className="mt-3 text-center text-[11px] text-gray-400">密码和明文都不会离开这台电脑</div>
        </div>
      )}

      <div className="absolute left-[1330px] top-[640px] flex flex-wrap gap-2" style={{ width: 410 }}>
        {[
          { icon: <ShieldCheck className="h-4 w-4" />, label: "AES-GCM 256", at: 5.6 },
          { icon: <LockKeyhole className="h-4 w-4" />, label: "Argon2id", at: 6.1 },
          { icon: <Monitor className="h-4 w-4" />, label: "仅本机存储", at: 6.6 },
        ].map((chip) => (
          <Reveal key={chip.label} t={t} at={chip.at} y={10}>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-600 shadow-sm">
              {chip.icon}
              {chip.label}
            </span>
          </Reveal>
        ))}
      </div>

      <Cursor
        t={t}
        points={[
          { at: 0, x: 1550, y: 900 },
          { at: 0.9, x: 900, y: 520 },
          { at: 2.0, x: 850, y: 548 },
          { at: 4.8, x: 1500, y: 480 },
        ]}
        clicks={[1.2, 2.4]}
        visibleTo={5.0}
      />
    </DesktopStage>
  );
}

/* ────────────────────────────── 10 · Sync ──────────────────────────────── */

const SYNC_ROWS = [
  { label: "Release checklist", tag: "Office-PC", color: "#0f6cbd", at: 1.4 },
  { label: "PROJ-128 · triage", tag: "Laptop", color: "#8764b8", at: 3.2 },
  { label: "dashboard.png", tag: "Office-PC", color: "#0f6cbd", at: 5.0 },
  { label: "设计稿已放到共享盘…", tag: "Laptop", color: "#8764b8", at: 6.8 },
];

export function SyncScene({ t }: SceneProps) {
  const travel = (delay: number) => {
    const local = clamp01((t - delay) / 2.2);
    const x = 710 + 540 * local;
    const y = 570 - Math.sin(local * Math.PI) * 160;
    return { x, y, opacity: t < delay ? 0 : t > delay + 2.2 ? 0 : 1 };
  };
  const synced = SYNC_ROWS.filter((row) => t >= row.at).length;

  return (
    <DesktopStage>
      <div className="absolute left-1/2 top-[90px] -translate-x-1/2 text-center">
        <Reveal t={t} at={0.2} y={12}>
          <span className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[13px] font-medium text-cyan-700">
            <Wifi className="h-4 w-4" /> 局域网配对 · mDNS
          </span>
        </Reveal>
        <Reveal t={t} at={0.6} y={12}>
          <div className="mt-4 flex items-center justify-center gap-3 text-[15px] text-gray-500">
            <Cloud className="h-5 w-5 text-blue-500" />
            WebDAV 同步已开启
            <span className="mx-2 h-1 w-1 rounded-full bg-gray-300" />
            <span className="font-semibold text-gray-800">{synced} / {SYNC_ROWS.length} 条已对齐</span>
          </div>
        </Reveal>
      </div>

      <div className="absolute left-[150px] top-[280px]">
        <DeviceFrame title="Office-PC · 台式机" style={{ width: 620 }}>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            {SYNC_ROWS.map((row) => (
              <SyncRow key={row.label} row={row} t={t} side="left" />
            ))}
          </div>
        </DeviceFrame>
      </div>

      <div className="absolute left-[1160px] top-[300px]">
        <DeviceFrame title="Laptop · 笔记本" style={{ width: 610 }}>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            {SYNC_ROWS.map((row) => (
              <SyncRow key={row.label} row={{ ...row, tag: row.tag === "Laptop" ? "Office-PC" : "Laptop", color: row.tag === "Laptop" ? "#0f6cbd" : "#8764b8" }} t={t} side="right" />
            ))}
          </div>
        </DeviceFrame>
      </div>

      <svg className="pointer-events-none absolute left-[700px] top-[390px]" width={560} height={380} viewBox="0 0 560 380">
        <path d="M 10 180 C 160 20 400 20 550 180" fill="none" stroke="rgba(37,99,235,0.25)" strokeWidth="3" strokeDasharray="8 10" />
        <path d="M 550 200 C 400 360 160 360 10 200" fill="none" stroke="rgba(139,92,246,0.2)" strokeWidth="3" strokeDasharray="8 10" />
      </svg>
      {[0.8, 2.2, 3.6, 5.0].map((delay, index) => {
        const dot = travel(delay + 0.3);
        return (
          <span
            key={index}
            className="pointer-events-none absolute h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_18px_rgba(37,99,235,0.9)]"
            style={{ left: dot.x - 6, top: dot.y - 6, opacity: dot.opacity }}
          />
        );
      })}
      {[1.4, 3.0, 4.6, 6.2].map((delay, index) => {
        const local = clamp01((t - delay) / 2.2);
        return (
          <span
            key={`back-${index}`}
            className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_16px_rgba(139,92,246,0.9)]"
            style={{
              left: 1250 - 540 * local,
              top: 590 + Math.sin(local * Math.PI) * 160,
              opacity: t >= delay && t < delay + 2.2 ? 1 : 0,
            }}
          />
        );
      })}

      <div className="absolute left-[820px] top-[830px] flex items-center gap-2">
        <span className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 shadow ring-1 ring-gray-200">
          <Tags className="mr-1 inline h-3.5 w-3.5 text-purple-500" />
          设备标签自动写入每条记录
        </span>
        <span className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 shadow ring-1 ring-gray-200">
          无账号 · 端到端由你掌控
        </span>
      </div>
    </DesktopStage>
  );
}

function SyncRow({
  row,
  t,
  side,
}: {
  row: (typeof SYNC_ROWS)[number];
  t: number;
  side: "left" | "right";
}) {
  const shown = progress(t, row.at, 0.5);
  const fromSide = side === "left" ? -18 : 18;
  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[12px]"
      style={{ opacity: shown, transform: `translateX(${(1 - shown) * fromSide}px)` }}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500">
        <FileText className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-gray-700">{row.label}</span>
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${row.color}14`, color: row.color }}>
        {row.tag}
      </span>
    </div>
  );
}

/* ────────────────────────────── 11 · Outro ─────────────────────────────── */

const SHORTCUTS = [
  ["Ctrl", "Shift", "V"],
  ["Ctrl", "Shift", "1…0"],
  ["Ctrl", "Alt", "V"],
  ["Alt", "C"],
  ["Space"],
  ["T", "P", "M"],
  ["O", "Z"],
];

export function OutroScene({ t }: SceneProps) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b1220] text-white">
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.25) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[980px] w-[1600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(37,99,235,0.24), rgba(37,99,235,0.05) 48%, transparent 72%)",
        }}
      />

      {/* Three-frame flashback, kept very faint. */}
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="absolute rounded-xl border border-white/10 bg-white/[0.04]"
          style={{
            left: 300 + index * 430,
            top: 200 + (index % 2) * 40,
            width: 360,
            height: 240,
            opacity: (1 - progress(t, 0.2, 1.6)) * 0.5,
            transform: `translateY(${progress(t, 0.2, 1.8) * -40}px) rotate(${index === 1 ? 0 : index === 0 ? -3 : 3}deg)`,
          }}
        >
          <div className="flex h-full flex-col gap-3 p-5">
            <div className="h-3 w-24 rounded bg-white/15" />
            <div className="h-2 w-full rounded bg-white/10" />
            <div className="h-2 w-4/5 rounded bg-white/10" />
            <div className="mt-auto h-8 w-20 rounded bg-blue-500/40" />
          </div>
        </div>
      ))}

      <div className="absolute left-1/2 top-[300px] -translate-x-1/2 text-center">
        <Reveal t={t} at={1.9} y={18} scale={0.94}>
          <div className="flex items-center justify-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_18px_50px_rgba(37,99,235,0.45)]">
              <ClipboardGlyph />
            </span>
            <span className="text-[58px] font-semibold tracking-[-0.03em]">EasyCPTrans</span>
          </div>
        </Reveal>

        <Reveal t={t} at={2.6} y={14}>
          <div className="mt-8 text-[34px] font-medium tracking-tight text-white/85">
            复制过的，<span className="text-blue-400">都在这里。</span>
          </div>
        </Reveal>

        <Reveal t={t} at={3.4} y={12}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            {SHORTCUTS.map((keys, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5"
              >
                {keys.map((key) => (
                  <kbd key={key} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white/75">
                    {key}
                  </kbd>
                ))}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal t={t} at={4.6} y={16}>
          <div className="mt-10 flex items-center justify-center gap-4">
            <span className="inline-flex h-14 items-center gap-2.5 rounded-xl bg-blue-600 px-7 text-[17px] font-semibold text-white shadow-[0_18px_44px_rgba(37,99,235,0.4)]">
              <Download className="h-5 w-5" />
              下载 Windows 版
            </span>
            <span className="inline-flex h-14 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-[15px] font-medium text-white/80">
              <GitBranch className="h-5 w-5" />
              minghf85/EasyCPTrans
            </span>
          </div>
        </Reveal>

        <Reveal t={t} at={5.6} y={10}>
          <div className="mt-6 flex items-center justify-center gap-4 text-[13px] text-white/45">
            <span>免费 · MIT 许可</span>
            <span className="h-1 w-1 rounded-full bg-white/25" />
            <span>本地优先 · 无账号</span>
            <span className="h-1 w-1 rounded-full bg-white/25" />
            <span>Tauri 2 + Rust</span>
          </div>
        </Reveal>
      </div>

      <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center gap-3 text-[12px] uppercase tracking-[0.28em] text-white/25">
        <span>EasyCPTrans</span>
        <span className="h-1 w-1 rounded-full bg-white/25" />
        <span>Clipboard history, reimagined</span>
      </div>
    </div>
  );
}
