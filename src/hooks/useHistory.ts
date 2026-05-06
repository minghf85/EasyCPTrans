import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import type { HistoryItem } from "../types";

/**
 * 维护剪贴板历史状态：
 * - 挂载时拉取一次（限制最大条数比如5000，防止SQLite和内存爆掉导致假死）
 * - 监听 Rust 端 "clipboard-changed" 广播，自动 reload
 */
export function useHistory(onError: (msg: string) => void) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const reload = useCallback(async () => {
    try {
      // Fetch up to a large reasonable limit in JS metadata, to allow filtering to work nicely globally
      const cfg = await api.getConfig() as any;
      const limit = cfg?.historyLimit || 5000;
      const items = await api.loadHistory(limit);
      setHistory(items);
    } catch (err) {
      onErrorRef.current("Load History Error: " + String(err));
    }
  }, []);

  useEffect(() => {
    reload();
    const unlistenP = listen("clipboard-changed", () => {
      reload();
    });
    return () => {
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  }, [reload]);

  return { history, reload };
}
