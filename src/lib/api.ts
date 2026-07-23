import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem, IngestResult, ManagedTag } from "../types";

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

  isPasteShortcutDown: () => invoke<boolean>("is_paste_shortcut_down").catch(() => false),

  togglePin: (id: number) => invoke<boolean>("toggle_pin", { id }),

  deleteItem: (id: number) => invoke<void>("delete_item", { id }),

  setTags: (id: number, tags: string[]) =>
    invoke<string[]>("set_tags", { id, tags }),

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

  simulatePaste: () => invoke<void>("simulate_paste"),

  translateSelectedText: () => invoke<void>("translate_selected_text"),

  convertEcdictCsvToSqlite: (csvPath: string, dbPath: string) =>
    invoke<number>("convert_ecdict_csv_to_sqlite", { csvPath, dbPath }),

  saveTempImage: (dataUrl: string) =>
    invoke<string>("save_temp_image", { dataUrl }),

  readImageAsDataUrl: (path: string) =>
    invoke<string>("read_image_as_data_url", { path }),

  verifyWebdav: (url: string, username: string, password?: string) =>
    invoke<boolean>("verify_webdav", { url, username, password }),

  triggerSync: () => invoke<void>("trigger_sync"),

  getConfig: () =>
    invoke<{
      cachePath: string;
      shortcut: string;
      queueStepShortcut?: string;
      quickPastePrefix?: string;
      stackShortcutPrefix?: string;
      wordTranslateShortcut?: string;
      ecdictPath?: string;
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
    ecdictPath?: string;
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
