import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem, IngestResult } from "../types";

// 单一入口封装所有 Rust 命令调用，方便集中替换/Mock。
export const api = {
  loadHistory: (limit = 100) =>
    invoke<HistoryItem[]>("load_history", { limit }),

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

  simulatePaste: () => invoke<void>("simulate_paste"),
};