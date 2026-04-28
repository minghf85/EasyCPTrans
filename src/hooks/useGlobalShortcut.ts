import { useEffect, useRef } from "react";
import {
  isRegistered,
  register,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 注册全局快捷键：按下时拉起主窗口并聚焦。
 */
export function useGlobalShortcut(
  shortcut: string,
  onError: (msg: string) => void,
) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let isSubscribed = true;

    const setup = async () => {
      try {
        if (await isRegistered(shortcut)) {
          await unregister(shortcut);
        }
        if (!isSubscribed) return;

        await register(shortcut, async (event) => {
          if (event.state === "Pressed") {
            try {
              const w = getCurrentWindow();
              await w.show();
              await w.setFocus();
            } catch (e) {
              onErrorRef.current("window operation failed: " + String(e));
            }
          }
        });
      } catch (err) {
        if (isSubscribed) {
          onErrorRef.current("Register shortcut failed: " + String(err));
        }
      }
    };
    setup();

    return () => {
      isSubscribed = false;
      unregister(shortcut).catch(console.error);
    };
  }, [shortcut]);
}
