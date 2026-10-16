export interface HistoryItem {
  id: number;
  contentType: string;
  content: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  pinned: boolean;
  isPrivate: boolean;
  tags: string[];
  metadata: Record<string, string[]>;
}

export interface ManagedTag {
  id?: string;
  name: string;
  common: boolean;
  color: string;
  system?: boolean;
  /** Regex source. When set, this tag becomes a rule tag and is applied
   * automatically to any item whose content matches. */
  pattern?: string | null;
  /** Match `pattern` case-insensitively. */
  ignoreCase?: boolean;
  /** Keep every match on the item so the card can stack them. */
  extract?: boolean;
}

/** Foreground window the clipboard content came from. */
export interface SourceAppInfo {
  /** Raw window title, e.g. `"notes.txt - Notepad"`. */
  title: string;
  /** Executable stem, e.g. `"notepad"`. */
  appName: string;
  /** Full executable path; also the icon cache key. */
  appPath: string;
}

/** An application icon as raw RGBA pixels, awaiting conversion to a data URL. */
export interface AppIconData {
  width: number;
  height: number;
  rgba: string;
}

export interface IngestResult {
  accepted: boolean;
  itemId: number | null;
  deduped: boolean;
  tags: string[];
  metadata: Record<string, string[]>;
  droppedBy?: string;
  reason?: string;
}
