import { invoke } from "@tauri-apps/api/core";
import type { AppIconData, HistoryItem, IngestResult, ManagedTag, SourceAppInfo } from "../types";
import type { Locale } from "./i18n";

// 单一入口封装所有 Rust 命令调用，方便集中替换/Mock。
export const api = {
  loadHistory: (limit = 5000) =>
    invoke<HistoryItem[]>("load_history", { limit }),

  getTextItem: (id: number) =>
    invoke<{ id: number; content: string }>("get_text_item", { id }),

  getPrivacyStatus: () =>
    invoke<{
      passwordSet: boolean;
      privateItems: number;
      securityQuestionSet: boolean;
      securityQuestion: string | null;
    }>("get_privacy_status"),

  ingest: (contentType: string, content: string, metadata?: Record<string, string[]>, sourceApp?: string) =>
    invoke<IngestResult>("ingest_clipboard", {
      payload: { contentType, content, metadata: metadata ?? {}, sourceApp: sourceApp ?? "" },
    }),

  readFiles: () => invoke<{path: string, size: number}[]>("read_clipboard_files"),

  getActiveWindow: () => invoke<string>("get_active_window").catch(() => ""),

  /** Foreground window plus its executable, used for the source-app icon. */
  getActiveWindowInfo: () =>
    invoke<SourceAppInfo>("get_active_window_info").catch(() => ({
      title: "",
      appName: "",
      appPath: "",
    })),

  /** Source-application icon as raw RGBA; `null` when the file has none. */
  getAppIcon: (appPath: string) =>
    invoke<AppIconData | null>("get_app_icon", { appPath }),

  /**
   * Starts a native Windows drag. Resolves once the drop completes, with the
   * resulting effect: `"copy"`, `"move"`, `"cancelled"` or `"none"`.
   *
   * `preview` is the drag image as raw RGBA — OLE wants a bitmap, and the canvas
   * the front-end paints it on is the only rasteriser in the project.
   */
  startDragOut: (payload: {
    text?: string;
    files?: string[];
    preview?: { width: number; height: number; rgba: string };
  }) => invoke<string>("start_drag_out", { payload }),

  /**
   * Native file drag via the Shell API (vPaste method).
   * Synchronous — blocks until the drop resolves.
   * Returns true if dropped, false if cancelled.
   */
  nativeDragFile: (paths: string[]) =>
    invoke<boolean>("native_drag_file", { paths }),

  /**
   * Runs a regex rule without saving it.
   *
   * Compiled by the same crate the ingest pipeline uses, so a pattern that
   * passes here is one that will compile when a clip is captured. Pass `sample`
   * to try it against pasted text; omit it to run over the recent history.
   */
  previewTagPattern: (pattern: string, ignoreCase: boolean, sample?: string) =>
    invoke<{
      matches: string[];
      total: number;
      truncated: boolean;
      segments: Array<{ text: string; matched: boolean }>;
      scanned: number;
      skipped: number;
    }>("preview_tag_pattern", { pattern, ignoreCase, sample: sample ?? null }),

  /** Checks a tag regex before saving, so the editor can reject a bad pattern. */
  validateTagPattern: (pattern: string, ignoreCase: boolean) =>
    invoke<void>("validate_tag_pattern", { pattern, ignoreCase }),

  isPasteShortcutDown: () => invoke<boolean>("is_paste_shortcut_down").catch(() => false),

  togglePin: (id: number) => invoke<boolean>("toggle_pin", { id }),

  deleteItem: (id: number) => invoke<void>("delete_item", { id }),

  setTags: (id: number, tags: string[]) =>
    invoke<string[]>("set_tags", { id, tags }),

  renameDeviceTag: (from: string, to: string) =>
    invoke<void>("rename_device_tag", { from, to }),

  markUsed: (id: number) => invoke<void>("mark_used", { id }),

  updateTextItem: (id: number, content: string) =>
    invoke<void>("update_text_item", { id, content }),

  createStackTextItem: (content: string) =>
    invoke<number>("create_stack_text_item", { content }),

  setPrivacyPassword: (
    newPassword: string,
    securityQuestion: string,
    securityAnswer: string,
    currentPassword?: string,
  ) =>
    invoke<void>("set_privacy_password", {
      newPassword,
      securityQuestion,
      securityAnswer,
      currentPassword,
    }),

  protectItem: (id: number) =>
    invoke<void>("protect_item", { id }),

  unprotectItem: (id: number, password: string) =>
    invoke<void>("unprotect_item", { id, password }),

  /**
   * Writes an image item to a temp file and returns its path. Named after the
   * item id, so calling it repeatedly is cheap and idempotent.
   */
  stageImageForDrag: (id: number) => invoke<string>("stage_image_for_drag", { id }),

  /**
   * Hands focus back to the window the panel was opened from, then sends Ctrl+V.
   * Passing `hidePanel: false` keeps a pinned panel on screen.
   *
   * This is the only paste entry point: sending Ctrl+V without first giving
   * focus back types into the panel itself.
   */
  pasteToPreviousWindow: (hidePanel: boolean) =>
    invoke<{ sent: boolean; focusMoved: boolean; restoredFocus: boolean }>(
      "paste_to_previous_window",
      { hidePanel },
    ),

  translateSelectedText: () => invoke<void>("translate_selected_text"),

  translateTextApi: (text: string, targetLang?: string) =>
    invoke<void>("translate_text_api", { text, targetLang }),

  ocrImageItem: (id: number, language?: string) =>
    invoke<string>("ocr_image_item", { id, language: language ?? null }),

  listOcrLanguages: () =>
    invoke<Array<{ tag: string; name: string }>>("list_ocr_languages"),

  setOcrText: (id: number, text: string) =>
    invoke<void>("set_ocr_text", { id, text }),

  createTextItemFromOcr: (id: number) =>
    invoke<number>("create_text_item_from_ocr", { id }),

  getProcessStats: () =>
    invoke<{
      workingSetBytes: number;
      privateBytes: number;
      peakWorkingSetBytes: number;
    }>("get_process_stats"),

  convertEcdictCsvToSqlite: (csvPath: string, dbPath: string) =>
    invoke<number>("convert_ecdict_csv_to_sqlite", { csvPath, dbPath }),

  saveTempImage: (dataUrl: string) =>
    invoke<string>("save_temp_image", { dataUrl }),

  readImageAsDataUrl: (path: string) =>
    invoke<string>("read_image_as_data_url", { path }),

  getImageContent: (id: number) =>
    invoke<string>("get_image_content", { id }),

  verifyWebdav: (url: string, username: string, password?: string) =>
    invoke<boolean>("verify_webdav", { url, username, password }),

  triggerSync: () => invoke<void>("trigger_sync"),

  lanSyncStatus: () =>
    invoke<{
      enabled: boolean;
      listening: boolean;
      port: number;
      pairingCodeSet: boolean;
      peers: Array<{ name: string; host: string; addresses: string[]; port: number }>;
    }>("lan_sync_status"),

  setLanSyncEnabled: (enabled: boolean, pairingCode?: string, port?: number) =>
    invoke<void>("set_lan_sync_enabled", { enabled, pairingCode, port }),

  triggerLanSync: () =>
    invoke<{
      peersFound: number;
      pushed: number;
      pulled: number;
      errors: string[];
    }>("trigger_lan_sync"),

  generateLanPairingCode: () => invoke<string>("generate_lan_pairing_code_command"),


  getConfig: () =>
    invoke<{
      cachePath: string;
      shortcut: string;
      queueStepShortcut?: string;
      quickPastePrefix?: string;
      stackShortcutPrefix?: string;
      wordTranslateShortcut?: string;
      itemTagShortcut?: string;
      itemPrivateShortcut?: string;
      itemPinShortcut?: string;
      itemDeleteShortcut?: string;
      itemOcrShortcut?: string;
      itemZoomShortcut?: string;
      ecdictPath?: string;
      locale?: Locale;
      defaultDir: string;
      effectiveDir: string;
      autoPaste: boolean;
      keepWindowOpen: boolean;
      alwaysOnTop?: boolean;
      pageSize: number;
      historyLimit?: number;
      webdavUrl: string;
      webdavUsername: string;
      webdavPassword: string;
      webdavSyncEnabled: boolean;
      deviceName: string;
      apiTranslateEnabled?: boolean;
      apiTranslateBaseUrl?: string;
      apiTranslateKey?: string;
      apiTranslateModel?: string;
      apiTranslateTargetLang?: string;
      lanSyncEnabled?: boolean;
      lanSyncPairingCode?: string;
      lanSyncPort?: number;
      ocrEnabled?: boolean;
      ocrAuto?: boolean;
      ocrLanguage?: string;
      showMemoryUsage?: boolean;
      managedTags: ManagedTag[];
      windowWidth?: number;
      windowHeight?: number;
      windowX?: number;
      windowY?: number;
    } | null>("get_config").catch(() => null),

  setConfig: (config: {
    cachePath?: string;
    shortcut?: string;
    queueStepShortcut?: string;
    quickPastePrefix?: string;
    stackShortcutPrefix?: string;
    wordTranslateShortcut?: string;
    itemTagShortcut?: string;
    itemPrivateShortcut?: string;
    itemPinShortcut?: string;
    itemDeleteShortcut?: string;
    itemOcrShortcut?: string;
    itemZoomShortcut?: string;
    ecdictPath?: string;
    locale?: Locale;
    autoPaste?: boolean;
    keepWindowOpen?: boolean;
    alwaysOnTop?: boolean;
    pageSize?: number;
    historyLimit?: number;
    webdavUrl?: string;
    webdavUsername?: string;
    webdavPassword?: string;
    webdavSyncEnabled?: boolean;
    deviceName?: string;
    apiTranslateEnabled?: boolean;
    apiTranslateBaseUrl?: string;
    apiTranslateKey?: string;
    apiTranslateModel?: string;
    apiTranslateTargetLang?: string;
    lanSyncEnabled?: boolean;
    lanSyncPairingCode?: string;
    lanSyncPort?: number;
    ocrEnabled?: boolean;
    ocrAuto?: boolean;
    ocrLanguage?: string;
    showMemoryUsage?: boolean;
    managedTags?: ManagedTag[];
    windowWidth?: number;
    windowHeight?: number;
    windowX?: number;
    windowY?: number;
  }) => invoke("set_config", { config }),

  refreshGlobalShortcuts: () =>
    invoke<{
      registered: string[];
      failed: Array<{ shortcut: string; action: string; reason: string }>;
    }>("refresh_global_shortcuts"),

  probeShortcutAvailable: (shortcut: string) =>
    invoke<boolean>("probe_shortcut_available", { shortcut }),

  syncQueueState: (ids: number[]) =>
    invoke<void>("sync_queue_state", { ids }),
};
