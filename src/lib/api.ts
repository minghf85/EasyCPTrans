import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem, IngestResult } from "../types";

// 单一入口封装所有 Rust 命令调用，方便集中替换/Mock。
export const api = {
  loadHistory: (limit = 100) =>
    invoke<HistoryItem[]>("load_history", { limit }),

  ingest: (contentType: string, content: string) =>
    invoke<IngestResult>("ingest_clipboard", {
      payload: { contentType, content },
    }),

  togglePin: (id: number) => invoke<boolean>("toggle_pin", { id }),

  deleteItem: (id: number) => invoke<void>("delete_item", { id }),

  setTags: (id: number, tags: string[]) =>
    invoke<string[]>("set_tags", { id, tags }),

  markUsed: (id: number) => invoke<void>("mark_used", { id }),

  simulatePaste: () => invoke<void>("simulate_paste"),
};
