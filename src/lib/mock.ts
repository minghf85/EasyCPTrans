import type { HistoryItem } from "../types";

const now = Date.now();
const demoImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#d7ebff"/>
          <stop offset="100%" stop-color="#f7fbff"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" rx="40" fill="url(#bg)"/>
      <circle cx="240" cy="190" r="88" fill="#9ac5f4"/>
      <path d="M80 620L360 360L560 560L710 430L1010 720H80Z" fill="#71a8dc"/>
      <path d="M160 720L470 410L660 610L840 470L1120 720H160Z" fill="#3f7fba"/>
      <text x="90" y="110" font-family="Segoe UI" font-size="44" fill="#1f4d73">EasyCPTrans Demo</text>
    </svg>
  `);

function isoMinutesAgo(minutes: number) {
  return new Date(now - minutes * 60 * 1000).toISOString();
}

export const mockHistory: HistoryItem[] = [
  {
    id: 900001,
    contentType: "text",
    content:
      "EasyCPTrans is a lightweight offline clipboard utility for Windows, focused on fast history access and smooth copy-paste workflows.",
    createdAt: isoMinutesAgo(1),
    lastUsedAt: isoMinutesAgo(1),
    useCount: 4,
    pinned: false,
    isPrivate: false,
    tags: ["product", "intro"],
    metadata: {
      length: ["128"],
      sourceApp: ["Google Chrome"],
    },
  },
  {
    id: 900002,
    contentType: "text",
    content:
      "<section class=\"hero\">\n  <h1>EasyCPTrans</h1>\n  <p>Clipboard history that feels instant.</p>\n</section>",
    createdAt: isoMinutesAgo(3),
    lastUsedAt: isoMinutesAgo(2),
    useCount: 8,
    pinned: true,
    isPrivate: false,
    tags: ["html", "ui", "code"],
    metadata: {
      length: ["108"],
      language: ["HTML"],
      sourceApp: ["Visual Studio Code"],
    },
  },
  {
    id: 900003,
    contentType: "text",
    content:
      "https://github.com/zhoushi1/tauri-plugin-clipboard-next\nClipboard watch and multi-type clipboard support for the Tauri backend.",
    createdAt: isoMinutesAgo(5),
    lastUsedAt: isoMinutesAgo(5),
    useCount: 2,
    pinned: false,
    isPrivate: false,
    tags: ["link", "plugin"],
    metadata: {
      length: ["127"],
      sourceApp: ["Microsoft Edge"],
    },
  },
  {
    id: 900006,
    contentType: "image",
    content: demoImage,
    createdAt: isoMinutesAgo(6),
    lastUsedAt: isoMinutesAgo(4),
    useCount: 2,
    pinned: false,
    isPrivate: false,
    tags: ["image", "demo"],
    metadata: {
      width: ["1200"],
      height: ["800"],
      size: ["248576"],
      sourceApp: ["Figma"],
    },
  },
  {
    id: 900004,
    contentType: "file",
    content: "EasyCPTrans.html\nclipboard-notes.md\nrelease-plan.txt",
    createdAt: isoMinutesAgo(8),
    lastUsedAt: isoMinutesAgo(8),
    useCount: 1,
    pinned: false,
    isPrivate: false,
    tags: ["files"],
    metadata: {
      totalSize: ["184320"],
      sizes: ["83200", "20480", "80640"],
      sourceApp: ["File Explorer"],
    },
  },
  {
    id: 900005,
    contentType: "text",
    content:
      "Meeting notes:\n- Finalize horizontal card layout\n- Keep memory usage low\n- Windows first\n- Translation/OCR later",
    createdAt: isoMinutesAgo(12),
    lastUsedAt: isoMinutesAgo(10),
    useCount: 3,
    pinned: false,
    isPrivate: false,
    tags: ["notes", "roadmap"],
    metadata: {
      length: ["110"],
      sourceApp: ["Notepad"],
    },
  },
];
