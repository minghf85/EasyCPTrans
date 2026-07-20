import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import type { HistoryItem } from "../types";

/**
 * 维护剪贴板历史状态：
 * - 挂载时拉取一次（限制最大条数比如5000，防止SQLite和内存爆掉导致假死）
 * - 监听 Rust 端 "clipboard-changed" 广播，自动 reload
 */
export function useHistory(
  historyLimit: number,
  onError: (msg: string) => void,
) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const onErrorRef = useRef(onError);
  const reloadPendingRef = useRef(false);
  const reloadInFlightRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  onErrorRef.current = onError;

  const reload = useCallback(async () => {
    if (reloadInFlightRef.current) {
      reloadPendingRef.current = true;
      return;
    }

    reloadInFlightRef.current = true;
    try {
      const items = await api.loadHistory(historyLimit);
      setHistory(items);
    } catch (err) {
      onErrorRef.current("Load History Error: " + String(err));
    } finally {
      reloadInFlightRef.current = false;
      if (reloadPendingRef.current) {
        reloadPendingRef.current = false;
        void reload();
      }
    }
  }, [historyLimit]);

  useEffect(() => {
    void reload();
    const unlistenP = listen("clipboard-changed", () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void reload();
      }, 120);
    });
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  }, [reload]);

  return { history, reload };
}
