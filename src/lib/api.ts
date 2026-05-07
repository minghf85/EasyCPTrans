import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem, IngestResult } from "../types";

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

  togglePin: (id: number) => invoke<boolean>("toggle_pin", { id }),

  deleteItem: (id: number) => invoke<void>("delete_item", { id }),

  setTags: (id: number, tags: string[]) =>
    invoke<string[]>("set_tags", { id, tags }),

  markUsed: (id: number) => invoke<void>("mark_used", { id }),

  updateTextItem: (id: number, content: string) =>
    invoke<void>("update_text_item", { id, content }),

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

  getConfig: () => invoke<{ cachePath: string; shortcut: string; defaultDir: string; effectiveDir: string; autoPaste: boolean; keepWindowOpen: boolean; pageSize: number; webdavUrl?: string; webdavUsername?: string; webdavPassword?: string; webdavSyncEnabled?: boolean } | null>("get_config").catch(() => null),

  setConfig: (config: { cachePath: string; shortcut: string; autoPaste: boolean; keepWindowOpen: boolean; pageSize: number; webdavUrl?: string; webdavUsername?: string; webdavPassword?: string; webdavSyncEnabled?: boolean }) => invoke("set_config", { config }),

  verifyWebdav: (url: string, username: string, password?: string) => invoke<boolean>("verify_webdav", { url, username, password }),

  triggerSync: () => invoke<void>("trigger_sync"),
};
