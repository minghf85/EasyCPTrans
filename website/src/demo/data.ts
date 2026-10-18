import type { HistoryItem, ManagedTag } from "../../../src/types";

/* ────────────────────────────── Sample time ────────────────────────────── */

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const hoursAgo = (hours: number) => minutesAgo(hours * 60);

/** Executable paths the mocked `get_app_icon` resolves to real brand marks. */
const APP_PATHS = {
  vscode: "C:\\Users\\ming\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
  chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  qq: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe",
  wechat: "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe",
  explorer: "C:\\Windows\\explorer.exe",
  notepad: "C:\\Windows\\System32\\notepad.exe",
  snipping: "C:\\Windows\\System32\\SnippingTool.exe",
  photos: "C:\\Windows\\System32\\Photos.exe",
  linear: "C:\\Users\\ming\\AppData\\Local\\Programs\\Linear\\Linear.exe",
} as const;

/* ────────────────────────────── Sample images ──────────────────────────── */

const codeShot = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
  <rect width="1200" height="760" fill="#0f172a"/>
  <rect width="1200" height="46" fill="#1e293b"/>
  <circle cx="26" cy="23" r="6" fill="#f87171"/><circle cx="48" cy="23" r="6" fill="#fbbf24"/><circle cx="70" cy="23" r="6" fill="#34d399"/>
  <rect x="100" y="15" width="220" height="16" rx="4" fill="#334155"/>
  <rect x="0" y="46" width="64" height="714" fill="#111c31"/>
  <g fill="#334155">
    <rect x="16" y="82" width="32" height="10" rx="3"/><rect x="16" y="112" width="32" height="10" rx="3"/>
    <rect x="16" y="142" width="32" height="10" rx="3"/><rect x="16" y="172" width="32" height="10" rx="3"/>
    <rect x="16" y="202" width="32" height="10" rx="3"/><rect x="16" y="232" width="32" height="10" rx="3"/>
  </g>
  <g>
    <rect x="100" y="92" width="90" height="14" rx="4" fill="#c084fc"/>
    <rect x="200" y="92" width="150" height="14" rx="4" fill="#60a5fa"/>
    <rect x="360" y="92" width="60" height="14" rx="4" fill="#94a3b8"/>
    <rect x="120" y="126" width="60" height="14" rx="4" fill="#c084fc"/>
    <rect x="190" y="126" width="120" height="14" rx="4" fill="#fbbf24"/>
    <rect x="320" y="126" width="90" height="14" rx="4" fill="#60a5fa"/>
    <rect x="140" y="160" width="120" height="14" rx="4" fill="#60a5fa"/>
    <rect x="270" y="160" width="180" height="14" rx="4" fill="#34d399"/>
    <rect x="460" y="160" width="60" height="14" rx="4" fill="#94a3b8"/>
    <rect x="140" y="194" width="80" height="14" rx="4" fill="#c084fc"/>
    <rect x="230" y="194" width="200" height="14" rx="4" fill="#fbbf24"/>
    <rect x="160" y="228" width="150" height="14" rx="4" fill="#60a5fa"/>
    <rect x="320" y="228" width="70" height="14" rx="4" fill="#34d399"/>
    <rect x="160" y="262" width="60" height="14" rx="4" fill="#c084fc"/>
    <rect x="230" y="262" width="110" height="14" rx="4" fill="#94a3b8"/>
    <rect x="140" y="296" width="220" height="14" rx="4" fill="#60a5fa"/>
    <rect x="370" y="296" width="90" height="14" rx="4" fill="#fbbf24"/>
    <rect x="120" y="330" width="80" height="14" rx="4" fill="#c084fc"/>
    <rect x="210" y="330" width="160" height="14" rx="4" fill="#60a5fa"/>
    <rect x="120" y="364" width="190" height="14" rx="4" fill="#34d399"/>
    <rect x="320" y="364" width="120" height="14" rx="4" fill="#94a3b8"/>
    <rect x="100" y="398" width="40" height="14" rx="4" fill="#c084fc"/>
    <rect x="150" y="398" width="170" height="14" rx="4" fill="#60a5fa"/>
    <rect x="330" y="398" width="60" height="14" rx="4" fill="#fbbf24"/>
  </g>
  <rect x="94" y="86" width="4" height="332" rx="2" fill="#3b82f6"/>
</svg>`;

const dashboardShot = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
  <rect width="1200" height="760" fill="#f8fafc"/>
  <rect width="220" height="760" fill="#0f172a"/>
  <rect x="28" y="30" width="120" height="18" rx="5" fill="#38bdf8"/>
  <g fill="#334155">
    <rect x="28" y="92" width="140" height="12" rx="4"/><rect x="28" y="124" width="110" height="12" rx="4"/>
    <rect x="28" y="156" width="150" height="12" rx="4"/><rect x="28" y="188" width="96" height="12" rx="4"/>
  </g>
  <rect x="28" y="150" width="164" height="26" rx="6" fill="#1e40af"/>
  <rect x="260" y="30" width="300" height="22" rx="6" fill="#cbd5e1"/>
  <rect x="920" y="24" width="240" height="34" rx="8" fill="#e2e8f0"/>
  <g>
    <rect x="260" y="92" width="280" height="150" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
    <rect x="280" y="114" width="90" height="12" rx="4" fill="#94a3b8"/>
    <rect x="280" y="146" width="140" height="26" rx="5" fill="#0f172a"/>
    <rect x="280" y="186" width="180" height="10" rx="4" fill="#cbd5e1"/>
    <rect x="580" y="92" width="280" height="150" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
    <rect x="600" y="114" width="90" height="12" rx="4" fill="#94a3b8"/>
    <rect x="600" y="146" width="100" height="26" rx="5" fill="#0f172a"/>
    <rect x="600" y="186" width="180" height="10" rx="4" fill="#bfdbfe"/>
    <rect x="900" y="92" width="280" height="150" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
    <rect x="920" y="114" width="90" height="12" rx="4" fill="#94a3b8"/>
    <rect x="920" y="146" width="120" height="26" rx="5" fill="#0f172a"/>
    <rect x="920" y="186" width="180" height="10" rx="4" fill="#cbd5e1"/>
  </g>
  <rect x="260" y="274" width="600" height="300" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
  <rect x="284" y="298" width="160" height="14" rx="4" fill="#94a3b8"/>
  <g fill="#3b82f6">
    <rect x="300" y="450" width="38" height="86" rx="4"/><rect x="360" y="420" width="38" height="116" rx="4"/>
    <rect x="420" y="474" width="38" height="62" rx="4"/><rect x="480" y="392" width="38" height="144" rx="4"/>
    <rect x="540" y="438" width="38" height="98" rx="4"/><rect x="600" y="366" width="38" height="170" rx="4"/>
    <rect x="660" y="410" width="38" height="126" rx="4"/><rect x="720" y="344" width="38" height="192" rx="4"/>
  </g>
  <rect x="260" y="598" width="600" height="130" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
  <polyline points="288,700 360,676 432,684 504,650 576,660 648,626 720,636 792,608" fill="none" stroke="#10b981" stroke-width="5" stroke-linecap="round"/>
  <rect x="900" y="274" width="280" height="454" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
  <g fill="#e2e8f0">
    <rect x="924" y="300" width="120" height="12" rx="4"/><rect x="924" y="336" width="232" height="10" rx="4"/>
    <rect x="924" y="360" width="208" height="10" rx="4"/><rect x="924" y="384" width="220" height="10" rx="4"/>
    <rect x="924" y="420" width="120" height="12" rx="4"/><rect x="924" y="456" width="232" height="10" rx="4"/>
    <rect x="924" y="480" width="196" height="10" rx="4"/><rect x="924" y="504" width="216" height="10" rx="4"/>
  </g>
</svg>`;

/** Data URLs returned by the mocked `get_image_content` command. */
export const SAMPLE_IMAGES: Record<number, string> = {
  105: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(codeShot)}`,
  106: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dashboardShot)}`,
};

/* ────────────────────────────── Managed tags ───────────────────────────── */

export const DEMO_TAGS: ManagedTag[] = [
  { id: "sys-text", name: "Text", common: true, color: "#0078d4", system: true },
  { id: "sys-image", name: "Image", common: true, color: "#107c10", system: true },
  { id: "sys-file", name: "File", common: true, color: "#7b4f9d", system: true },
  { id: "sys-pinned", name: "Pinned", common: true, color: "#d83b01", system: true },
  { id: "sys-word", name: "Word", common: true, color: "#0067c0", system: true },
  { id: "sys-private", name: "Private", common: true, color: "#a4262c", system: true },
  {
    id: "sys-device-office-pc",
    name: "Office-PC",
    common: false,
    color: "#8764b8",
    system: true,
  },
  { id: "tag-work", name: "work", common: true, color: "#0f6cbd" },
  { id: "tag-code", name: "code", common: true, color: "#0b6a0b" },
  { id: "tag-design", name: "design", common: true, color: "#c239b3" },
  { id: "tag-todo", name: "todo", common: false, color: "#ca5010" },
  { id: "tag-links", name: "links", common: false, color: "#038387" },
  {
    id: "tag-issue",
    name: "issue",
    common: false,
    color: "#d13438",
    pattern: "[A-Z]+-\\d+",
    ignoreCase: false,
    extract: true,
  },
];

/* ────────────────────────────── History ────────────────────────────────── */

const workNotes = `Q4 planning notes

- Ship the interactive onboarding tour
- Cut the duplicate-file ingest bug
- Review the sync queue before Friday
- Publish the new website

Owner: minghf85`;

const codeSnippet = `export function useDebouncedValue<T>(value: T, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}`;

const triage = `Bug triage — clipboard

PROJ-128  a copied file is stored twice
PROJ-233  the drag step needs a file or image card
PROJ-241  the settings tab spinner never resets
PROJ-262  tag rules should scan OCR text
PROJ-277  queue paste should keep the panel open

Next: add a regression test around the ingest lock.`;

const links = `https://github.com/minghf85/EasyCPTrans
https://tauri.app/
https://github.com/skywind3000/ECDICT
https://lucide.dev/icons/`;

const releaseChecklist = `Release checklist

1. cargo test --manifest-path src-tauri/Cargo.toml --lib
2. pnpm test
3. pnpm build
4. pnpm tauri build
5. tag the release and write the notes`;

const privateCodes = `Recovery codes

4F2A-9C11 · 77B0-2D8E · C31D-88FA

Do not share. These codes are stored encrypted.`;

const translation = `# resilient

/rɪˈzɪliənt/ · adjective

---

## 中文释义

- 有韧性的；能迅速恢复的
- 适应力强的；不容易被打倒的

## English

- able to recover quickly from difficulties

---

🏷 CET6 · Oxford 3000 · COCA 8421`;

const designIdea = `Idea: add a command palette to the panel

- fuzzy search across cards
- recent commands first
- keyboard only, no mouse
- maybe reuse the same spotlight UI as the tour`;

const qqMessage = `周会改到周四 10:00，会议室 3B。

@minghf85 记得把发布清单带上，顺便同步一下官网进度。`;

const wechatMessage = `设计稿已经放到共享盘了：
\\\\team\\design\\q4\\final.sketch

需要我同步一份 PDF 吗？`;

export const DEMO_ITEMS: HistoryItem[] = [
  {
    id: 108,
    contentType: "text",
    content: releaseChecklist,
    createdAt: hoursAgo(9),
    lastUsedAt: hoursAgo(9),
    useCount: 12,
    pinned: true,
    isPrivate: false,
    tags: ["Pinned", "work", "todo"],
    metadata: {
      length: [releaseChecklist.length.toString()],
      sourceApp: ["RELEASING.md — Visual Studio Code"],
      appName: ["Code"],
      appPath: [APP_PATHS.vscode],
    },
  },
  {
    id: 110,
    contentType: "text",
    content: translation,
    createdAt: minutesAgo(2),
    lastUsedAt: minutesAgo(2),
    useCount: 7,
    pinned: false,
    isPrivate: false,
    tags: ["Word"],
    metadata: {
      translationStatus: ["done"],
      wordQuery: ["resilient"],
      sourceApp: ["selection — Visual Studio Code"],
      appName: ["Code"],
      appPath: [APP_PATHS.vscode],
    },
  },
  {
    id: 103,
    contentType: "text",
    content: triage,
    createdAt: minutesAgo(6),
    lastUsedAt: minutesAgo(6),
    useCount: 8,
    pinned: false,
    isPrivate: false,
    tags: ["work", "issue"],
    metadata: {
      length: [triage.length.toString()],
      "tagMatch:issue": ["PROJ-128", "PROJ-233", "PROJ-241", "PROJ-262", "PROJ-277"],
      "tagMatchTotal:issue": ["5"],
      sourceApp: ["Triage — Linear"],
      appName: ["Linear"],
      appPath: [APP_PATHS.linear],
    },
  },
  {
    id: 101,
    contentType: "text",
    content: workNotes,
    createdAt: minutesAgo(12),
    lastUsedAt: minutesAgo(12),
    useCount: 3,
    pinned: false,
    isPrivate: false,
    tags: ["work", "todo"],
    metadata: {
      length: [workNotes.length.toString()],
      sourceApp: ["planning.md — Visual Studio Code"],
      appName: ["Code"],
      appPath: [APP_PATHS.vscode],
    },
  },
  {
    id: 113,
    contentType: "text",
    content: qqMessage,
    createdAt: minutesAgo(18),
    lastUsedAt: minutesAgo(18),
    useCount: 2,
    pinned: false,
    isPrivate: false,
    tags: ["work"],
    metadata: {
      length: [qqMessage.length.toString()],
      sourceApp: ["产品群 — QQ"],
      appName: ["QQ"],
      appPath: [APP_PATHS.qq],
    },
  },
  {
    id: 114,
    contentType: "text",
    content: wechatMessage,
    createdAt: minutesAgo(24),
    lastUsedAt: minutesAgo(24),
    useCount: 5,
    pinned: false,
    isPrivate: false,
    tags: ["design", "work"],
    metadata: {
      length: [wechatMessage.length.toString()],
      sourceApp: ["设计组 — 微信"],
      appName: ["WeChat"],
      appPath: [APP_PATHS.wechat],
    },
  },
  {
    id: 102,
    contentType: "text",
    content: codeSnippet,
    createdAt: minutesAgo(35),
    lastUsedAt: minutesAgo(35),
    useCount: 9,
    pinned: false,
    isPrivate: false,
    tags: ["code", "work"],
    metadata: {
      language: ["tsx"],
      length: [codeSnippet.length.toString()],
      sourceApp: ["useDebouncedValue.ts — Visual Studio Code"],
      appName: ["Code"],
      appPath: [APP_PATHS.vscode],
    },
  },
  {
    id: 104,
    contentType: "text",
    content: links,
    createdAt: hoursAgo(2),
    lastUsedAt: hoursAgo(2),
    useCount: 6,
    pinned: false,
    isPrivate: false,
    tags: ["links"],
    metadata: {
      length: [links.length.toString()],
      urls: links.split("\n"),
      sourceApp: ["New Tab — Google Chrome"],
      appName: ["Chrome"],
      appPath: [APP_PATHS.chrome],
    },
  },
  {
    id: 105,
    contentType: "image",
    content: SAMPLE_IMAGES[105],
    createdAt: hoursAgo(3),
    lastUsedAt: hoursAgo(3),
    useCount: 5,
    pinned: false,
    isPrivate: false,
    tags: ["code"],
    metadata: {
      width: ["1200"],
      height: ["760"],
      size: ["512000"],
      ocrText: [
        "src/hooks/useClipboardWatcher.ts\n\nerror TS2307: Cannot find module '@tauri-apps/api/core'\n  at ingestClipboard (commands.rs:1217)",
      ],
      ocrLanguage: ["en-US"],
      sourceApp: ["Screenshot — Snipping Tool"],
      appName: ["Snipping Tool"],
      appPath: [APP_PATHS.snipping],
    },
  },
  {
    id: 106,
    contentType: "image",
    content: SAMPLE_IMAGES[106],
    createdAt: hoursAgo(5),
    lastUsedAt: hoursAgo(5),
    useCount: 2,
    pinned: false,
    isPrivate: false,
    tags: ["design"],
    metadata: {
      width: ["1200"],
      height: ["760"],
      size: ["486400"],
      ocrText: ["Weekly dashboard\nActive users 24,810\nRetention 68%\nClipboard captures 1.2M"],
      ocrLanguage: ["en-US"],
      sourceApp: ["dashboard.png — Photos"],
      appName: ["Photos"],
      appPath: [APP_PATHS.photos],
    },
  },
  {
    id: 107,
    contentType: "file",
    content:
      "C:\Users\ming\Documents\Q4-plan.pdf\nC:\Users\ming\Pictures\roadmap.png\nC:\Users\ming\Desktop\assets.zip",
    createdAt: hoursAgo(7),
    lastUsedAt: hoursAgo(7),
    useCount: 3,
    pinned: false,
    isPrivate: false,
    tags: ["work"],
    metadata: {
      count: ["3"],
      totalSize: ["35651584"],
      sizes: ["2097152", "4404019", "29152256"].map(String),
      sourceApp: ["Downloads — File Explorer"],
      appName: ["explorer"],
      appPath: [APP_PATHS.explorer],
    },
  },
  {
    id: 109,
    contentType: "text",
    content: privateCodes,
    createdAt: hoursAgo(11),
    lastUsedAt: hoursAgo(11),
    useCount: 1,
    pinned: false,
    isPrivate: true,
    tags: ["Private", "work"],
    metadata: {
      length: [privateCodes.length.toString()],
      sourceApp: ["vault.txt — Notepad"],
      appName: ["Notepad"],
      appPath: [APP_PATHS.notepad],
    },
  },
  {
    id: 111,
    contentType: "text",
    content: "Shared from the office desktop.\n\nRemember to sync before leaving — the panel keeps the last 5000 items.",
    createdAt: hoursAgo(26),
    lastUsedAt: hoursAgo(26),
    useCount: 4,
    pinned: false,
    isPrivate: false,
    tags: ["Office-PC", "work"],
    metadata: {
      length: ["112"],
      sourceApp: ["notes.txt — Notepad"],
      appName: ["Notepad"],
      appPath: [APP_PATHS.notepad],
    },
  },
  {
    id: 112,
    contentType: "text",
    content: designIdea,
    createdAt: hoursAgo(49),
    lastUsedAt: hoursAgo(49),
    useCount: 2,
    pinned: false,
    isPrivate: false,
    tags: ["design", "todo"],
    metadata: {
      length: [designIdea.length.toString()],
      sourceApp: ["Ideas.md — Visual Studio Code"],
      appName: ["Code"],
      appPath: [APP_PATHS.vscode],
    },
  },
];

/** Replica of the backend's `ORDER BY is_pinned DESC, last_used_at DESC, id DESC`. */
export function sortDemoItems(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") ||
      b.id - a.id,
  );
}

/* ────────────────────────────── Mock config ────────────────────────────── */

/**
 * What `get_config` returns in the demo. Every field the real Settings page
 * reads is present, so the page renders exactly like the desktop app.
 */
export const DEMO_CONFIG = {
  cachePath: "",
  shortcut: "CommandOrControl+Shift+V",
  queueStepShortcut: "CommandOrControl+Alt+V",
  quickPastePrefix: "CommandOrControl+Shift",
  stackShortcutPrefix: "CommandOrControl+Alt",
  wordTranslateShortcut: "Alt+C",
  itemTagShortcut: "T",
  itemPrivateShortcut: "M",
  itemPinShortcut: "P",
  itemDeleteShortcut: "Delete",
  itemOcrShortcut: "O",
  itemZoomShortcut: "Z",
  ecdictPath: "demo/ecdict.db",
  locale: "zh-CN",
  defaultDir: "C:\\Users\\ming\\AppData\\Roaming\\EasyCPTrans",
  effectiveDir: "C:\\Users\\ming\\AppData\\Roaming\\EasyCPTrans",
  autoPaste: true,
  keepWindowOpen: false,
  alwaysOnTop: false,
  pageSize: 50,
  historyLimit: 5000,
  webdavUrl: "https://dav.example.com/easycptrans",
  webdavUsername: "minghf85",
  webdavPassword: "",
  webdavSyncEnabled: true,
  deviceName: "Office-PC",
  apiTranslateEnabled: true,
  apiTranslateBaseUrl: "https://api.openai.com/v1",
  apiTranslateKey: "sk-demo",
  apiTranslateModel: "gpt-4o-mini",
  apiTranslateTargetLang: "中文",
  lanSyncEnabled: true,
  lanSyncPairingCode: "AB12CD",
  lanSyncPort: 0,
  ocrEnabled: true,
  ocrAuto: true,
  ocrLanguage: "",
  showMemoryUsage: true,
  managedTags: DEMO_TAGS,
};
