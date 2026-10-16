import {
  File,
  FileArchive,
  FileBraces,
  FileCode,
  FileHeadphone,
  FileImage,
  FileKey,
  FileLock,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideoCamera,
  Presentation,
  type LucideIcon,
} from "lucide-react";

/**
 * Presentation for a file's kind: a glyph plus the two colors of the tile
 * gradient the card paints behind it.
 */
export interface FileKind {
  icon: LucideIcon;
  from: string;
  to: string;
  label: string;
}

function kind(
  icon: LucideIcon,
  from: string,
  to: string,
  label: string,
): FileKind {
  return { icon, from, to, label };
}

const IMAGE = kind(FileImage, "#2dd4bf", "#0ea5e9", "Image");
const VIDEO = kind(FileVideoCamera, "#fb7185", "#f97316", "Video");
const AUDIO = kind(FileHeadphone, "#c084fc", "#f472b6", "Audio");
const ARCHIVE = kind(FileArchive, "#fbbf24", "#f59e0b", "Archive");
const CODE = kind(FileCode, "#60a5fa", "#6366f1", "Code");
const MARKUP = kind(FileCode, "#38bdf8", "#818cf8", "Web");
const DATA = kind(FileBraces, "#34d399", "#14b8a6", "Data");
const SHEET = kind(FileSpreadsheet, "#4ade80", "#16a34a", "Spreadsheet");
const DOCUMENT = kind(FileText, "#60a5fa", "#3b82f6", "Document");
const SLIDES = kind(Presentation, "#fdba74", "#f97316", "Slides");
const FONT = kind(FileType, "#a78bfa", "#8b5cf6", "Font");
const EXECUTABLE = kind(FileTerminal, "#94a3b8", "#64748b", "Program");
const SECRET = kind(FileKey, "#facc15", "#eab308", "Key");
const LOCKED = kind(FileLock, "#a3a3a3", "#737373", "Locked");
const UNKNOWN = kind(File, "#94a3b8", "#7c8ba1", "File");

const BY_EXTENSION: Record<string, FileKind> = {
  // images
  png: IMAGE, jpg: IMAGE, jpeg: IMAGE, gif: IMAGE, bmp: IMAGE, webp: IMAGE,
  svg: IMAGE, ico: IMAGE, tif: IMAGE, tiff: IMAGE, heic: IMAGE, avif: IMAGE, psd: IMAGE,
  // video
  mp4: VIDEO, mkv: VIDEO, avi: VIDEO, mov: VIDEO, wmv: VIDEO, flv: VIDEO,
  webm: VIDEO, m4v: VIDEO, mpg: VIDEO, mpeg: VIDEO,
  // audio
  mp3: AUDIO, wav: AUDIO, flac: AUDIO, aac: AUDIO, ogg: AUDIO, m4a: AUDIO,
  wma: AUDIO, opus: AUDIO, mid: AUDIO, midi: AUDIO,
  // archives
  zip: ARCHIVE, rar: ARCHIVE, "7z": ARCHIVE, tar: ARCHIVE, gz: ARCHIVE,
  bz2: ARCHIVE, xz: ARCHIVE, iso: ARCHIVE, cab: ARCHIVE, tgz: ARCHIVE,
  // source code
  js: CODE, mjs: CODE, cjs: CODE, ts: CODE, tsx: CODE, jsx: CODE, py: CODE, rs: CODE,
  go: CODE, java: CODE, c: CODE, cpp: CODE, cc: CODE, h: CODE, hpp: CODE,
  cs: CODE, rb: CODE, php: CODE, swift: CODE, kt: CODE, scala: CODE,
  sh: CODE, bash: CODE, ps1: CODE, bat: CODE, cmd: CODE, sql: CODE, lua: CODE, dart: CODE,
  // web
  html: MARKUP, htm: MARKUP, css: MARKUP, scss: MARKUP, sass: MARKUP,
  less: MARKUP, vue: MARKUP, svelte: MARKUP, astro: MARKUP,
  // structured data
  json: DATA, jsonc: DATA, xml: DATA, yaml: DATA, yml: DATA, toml: DATA,
  ini: DATA, env: DATA, conf: DATA,
  // spreadsheets
  csv: SHEET, tsv: SHEET, xls: SHEET, xlsx: SHEET, xlsm: SHEET, ods: SHEET,
  // documents
  txt: DOCUMENT, md: DOCUMENT, markdown: DOCUMENT, rst: DOCUMENT, log: DOCUMENT,
  pdf: DOCUMENT, doc: DOCUMENT, docx: DOCUMENT, rtf: DOCUMENT, odt: DOCUMENT, epub: DOCUMENT,
  // slides
  ppt: SLIDES, pptx: SLIDES, odp: SLIDES, key: SLIDES,
  // fonts
  ttf: FONT, otf: FONT, woff: FONT, woff2: FONT, eot: FONT,
  // programs
  exe: EXECUTABLE, msi: EXECUTABLE, com: EXECUTABLE, appx: EXECUTABLE, dll: EXECUTABLE,
  // secrets
  pem: SECRET, pfx: SECRET, p12: SECRET, crt: SECRET, cer: SECRET,
  asc: SECRET, gpg: SECRET,
  lock: LOCKED,
};

/** Icon, colors and label for a path, based on its extension. */
export function fileKindFor(path: string): FileKind {
  const name = fileBasename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    // Dotfiles such as `.gitignore` have no extension to read.
    return UNKNOWN;
  }
  return BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? UNKNOWN;
}

/** Final path segment, tolerating both `\` and `/` separators. */
export function fileBasename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

/** Everything before the final segment; empty for a bare filename. */
export function fileParentDir(path: string): string {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index > 0 ? path.slice(0, index) : "";
}

/** Lowercased extension without the dot, or an empty string. */
export function fileExtension(path: string): string {
  const name = fileBasename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}
