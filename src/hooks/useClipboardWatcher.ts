import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getDefaultSaveImagePath,
  onClipboardChange,
  readClipboard,
  startListening,
  writeFiles,
  writeText,
  type ReadClipboard,
} from "tauri-plugin-clipboard-x-api";
import { api } from "../lib/api";

export let injectedOverrideSig: string | null = null;

export function setInjectedOverrideSig(sig: string | null) {
  injectedOverrideSig = sig;
}

type StackDirection = "up" | "down";
type StackState = {
  direction: StackDirection;
  contentType: "text" | "file" | null;
  itemId: number | null;
  textItems: string[];
  fileItems: string[];
};

let resetStackHandler: (() => Promise<void>) | null = null;
let stackEnabled = false;
let pastePollTimer: number | null = null;
let translationSuppressUntil = 0;
let clipboardWriteSuppressUntil = 0;

export function resetClipboardStack() {
  return resetStackHandler?.() ?? Promise.resolve();
}

function dataUrlByteLength(dataUrl: string) {
  const encoded = dataUrl.split(",", 2)[1] ?? "";
  const normalized = encoded.replace(/\s/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

async function imagePathToDataUrl(path: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await api.readImageAsDataUrl(path);
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => window.setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function useClipboardWatcher(
  _intervalMs: number,
  onError: (msg: string) => void,
) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let lastSig = "";
    let unlisten: (() => void) | null = null;
    let unlistenStackMode: (() => void) | null = null;
    let unlistenStackReset: (() => void) | null = null;
    let unlistenTranslationState: (() => void) | null = null;
    let unlistenClipboardOverride: (() => void) | null = null;
    let stackState: StackState | null = null;
    let pastePollBusy = false;

    const stopPasteShortcutPolling = () => {
      if (pastePollTimer !== null) {
        window.clearInterval(pastePollTimer);
        pastePollTimer = null;
      }
    };

    const resetStack = async () => {
      stackState = null;
      stackEnabled = false;
      lastSig = "";
      injectedOverrideSig = null;
      stopPasteShortcutPolling();
    };

    const startPasteShortcutPolling = () => {
      stopPasteShortcutPolling();
      pastePollTimer = window.setInterval(() => {
        if (!stackEnabled || pastePollBusy) return;
        pastePollBusy = true;
        void api.isPasteShortcutDown()
          .then((isDown) => {
            if (isDown && stackEnabled) {
              void resetStack();
            }
          })
          .catch(console.error)
          .finally(() => {
            pastePollBusy = false;
          });
      }, 35);
    };

    resetStackHandler = resetStack;

    const toggleStackMode = (direction: StackDirection) => {
      if (stackState?.direction === direction) {
        void resetStack();
        return;
      }
      stackState = {
        direction,
        contentType: null,
        itemId: null,
        textItems: [],
        fileItems: [],
      };
      stackEnabled = true;
      startPasteShortcutPolling();
    };

    const stackFiles = async (paths: string[]) => {
      if (!stackState) return false;
      if (stackState.contentType !== "file") {
        stackState.contentType = "file";
        stackState.itemId = null;
        stackState.fileItems = [];
        stackState.textItems = [];
      }
      stackState.fileItems =
        stackState.direction === "up"
          ? [...paths, ...stackState.fileItems]
          : [...stackState.fileItems, ...paths];
      const combinedSig = `files_${stackState.fileItems.join("|")}`;
      injectedOverrideSig = combinedSig;
      lastSig = combinedSig;
      await writeFiles(stackState.fileItems);
      return true;
    };

    const ingestText = async (text: string) => {
      const metadata = { length: [text.length.toString()] };
      const win = await api.getActiveWindow();
      const result = await api.ingest("text", text, metadata, win);
      if (!result.accepted) {
        console.log("dropped:", result.droppedBy, result.reason);
      }
      return result;
    };

    const stackText = async (text: string) => {
      if (!stackState) return false;
      if (stackState.contentType !== "text") {
        stackState.contentType = "text";
        stackState.itemId = null;
        stackState.textItems = [];
        stackState.fileItems = [];
      }
      stackState.textItems =
        stackState.direction === "up"
          ? [text, ...stackState.textItems]
          : [...stackState.textItems, text];
      const combined = stackState.textItems.join("\n");
      injectedOverrideSig = combined;
      lastSig = combined;
      await writeText(combined);
      if (stackState.itemId) {
        await api.updateTextItem(stackState.itemId, combined);
      } else {
        stackState.itemId = await api.createStackTextItem(combined);
      }
      return true;
    };

    const ingestFile = async (files: { path: string; size: number }[]) => {
      const fileLines = files.map((f) => f.path).join("\n");
      const totalSize = files.reduce((acc, f) => acc + f.size, 0);
      const metadata = {
        count: [files.length.toString()],
        totalSize: [totalSize.toString()],
        sizes: files.map((f) => f.size.toString()),
      };
      const win = await api.getActiveWindow();
      const result = await api.ingest("file", fileLines, metadata, win);
      if (!result.accepted) {
        console.log("dropped:", result.droppedBy, result.reason);
      }
    };

    const ingestImage = async (clipboard: NonNullable<ReadClipboard["image"]>) => {
      const dataUrl = await imagePathToDataUrl(clipboard.value);
      const metadata = {
        width: [clipboard.width.toString()],
        height: [clipboard.height.toString()],
        size: [dataUrlByteLength(dataUrl).toString()],
      };
      const win = await api.getActiveWindow();
      const result = await api.ingest("image", dataUrl, metadata, win);
      if (!result.accepted) {
        console.log("dropped:", result.droppedBy, result.reason);
      }
    };

    const handleClipboardChange = async (clipboard: ReadClipboard) => {
      if (cancelled) return;
      try {
        if (injectedOverrideSig !== null) {
          lastSig = injectedOverrideSig;
          injectedOverrideSig = null;
        }

        if (clipboard.files?.value.length) {
          const files = await api.readFiles().catch(() =>
            clipboard.files!.value.map((path) => ({ path, size: 0 })),
          );
          const paths = files.map((file) => file.path);
          const sig = `files_${clipboard.files.value.join("|")}`;
          if (sig !== lastSig) {
            lastSig = sig;
            if (Date.now() < clipboardWriteSuppressUntil || Date.now() < translationSuppressUntil) return;
            if (await stackFiles(paths)) return;
            await ingestFile(files);
            return;
          }
        }

        if (clipboard.image?.value) {
          const sig = `img_${clipboard.image.width}x${clipboard.image.height}_${clipboard.image.value}`;
          if (sig !== lastSig) {
            lastSig = sig;
            if (Date.now() < clipboardWriteSuppressUntil || Date.now() < translationSuppressUntil) return;
            await ingestImage(clipboard.image);
            return;
          }
        }

        if (clipboard.text?.value) {
          const text = clipboard.text.value;
          if (text && text !== lastSig) {
            lastSig = text;
            if (Date.now() < clipboardWriteSuppressUntil || Date.now() < translationSuppressUntil) return;
            if (await stackText(text)) return;
            await ingestText(text);
          }
        }
      } catch (err) {
        onErrorRef.current("Clipboard error: " + String(err));
      }
    };

    const handleStackPasteKeyDown = (event: KeyboardEvent) => {
      const isPasteKey =
        event.key.toLowerCase() === "v" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey;
      if (isPasteKey && stackEnabled) {
        stackState = null;
        stackEnabled = false;
        lastSig = "";
        injectedOverrideSig = null;
      }
    };

    const setup = async () => {
      try {
        const imagePath = await getDefaultSaveImagePath();
        const initial = await readClipboard(imagePath).catch(() => null);
        if (initial?.files?.value.length) {
          lastSig = `files_${initial.files.value.join("|")}`;
        } else if (initial?.text?.value) {
          lastSig = initial.text.value;
        } else if (initial?.image?.value) {
          lastSig = `img_${initial.image.width}x${initial.image.height}_${initial.image.value}`;
        }
        await startListening();
        unlisten = await onClipboardChange(handleClipboardChange, {
          saveImagePath: imagePath,
        });
        unlistenStackMode = await listen<{ direction: StackDirection }>(
          "eacptrans://stack-mode",
          ({ payload }) => {
            if (payload?.direction === "up" || payload?.direction === "down") {
              toggleStackMode(payload.direction);
            }
          },
        );
        unlistenStackReset = await listen("eacptrans://stack-reset", () => {
          void resetStack();
        });
        unlistenTranslationState = await listen<{
          active: boolean;
          query: string;
          itemId: number;
        }>("eacptrans://translation-state", ({ payload }) => {
          if (payload?.active) {
            translationSuppressUntil = Date.now() + 15_000;
            lastSig = payload.query;
            injectedOverrideSig = payload.query;
            return;
          }
          translationSuppressUntil = Date.now() + 1_500;
          injectedOverrideSig = null;
        });
        unlistenClipboardOverride = await listen<{ sig: string }>(
          "eacptrans://clipboard-override",
          ({ payload }) => {
            if (!payload?.sig) return;
            injectedOverrideSig = payload.sig;
            lastSig = payload.sig;
            clipboardWriteSuppressUntil = Date.now() + 2_000;
            window.setTimeout(() => {
              if (injectedOverrideSig === payload.sig) {
                injectedOverrideSig = null;
              }
            }, 2_000);
          },
        );
        window.addEventListener("keydown", handleStackPasteKeyDown, true);
      } catch (err) {
        onErrorRef.current("Clipboard watch setup error: " + String(err));
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
      unlistenStackMode?.();
      unlistenStackReset?.();
      unlistenTranslationState?.();
      unlistenClipboardOverride?.();
      if (resetStackHandler === resetStack) {
        resetStackHandler = null;
      }
      window.removeEventListener("keydown", handleStackPasteKeyDown, true);
      stopPasteShortcutPolling();
    };
  }, []);
}
