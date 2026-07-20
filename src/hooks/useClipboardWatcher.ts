import { useEffect, useRef } from "react";
import {
  getFilePath,
  onClipboardChange,
  readClipboard,
  startWatch,
  type ReadClipboard,
} from "tauri-plugin-clipboard-next-api";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../lib/api";

export let injectedOverrideSig: string | null = null;

export function setInjectedOverrideSig(sig: string | null) {
  injectedOverrideSig = sig;
}

async function imagePathToDataUrl(path: string): Promise<string> {
  const url = convertFileSrc(path);
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

    const ingestText = async (text: string) => {
      const metadata = { length: [text.length.toString()] };
      const win = await api.getActiveWindow();
      const result = await api.ingest("text", text, metadata, win);
      if (!result.accepted) {
        console.log("dropped:", result.droppedBy, result.reason);
      }
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
      const dataUrl = await imagePathToDataUrl(clipboard.value.path);
      const metadata = {
        width: [clipboard.value.width.toString()],
        height: [clipboard.value.height.toString()],
        size: [clipboard.value.size.toString()],
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

        if (clipboard.files?.value.files.length) {
          const files = clipboard.files.value.files;
          const sig = `files_${files.map((f) => `${f.path}_${f.size}`).join("|")}`;
          if (sig !== lastSig) {
            lastSig = sig;
            await ingestFile(files);
            return;
          }
        }

        if (clipboard.text?.value) {
          const text = clipboard.text.value;
          if (text && text !== lastSig) {
            lastSig = text;
            await ingestText(text);
            return;
          }
        }

        if (clipboard.image?.value.path) {
          const sig = `img_${clipboard.image.value.width}x${clipboard.image.value.height}`;
          if (sig !== lastSig) {
            lastSig = sig;
            await ingestImage(clipboard.image);
          }
        }
      } catch (err) {
        onErrorRef.current("Clipboard error: " + String(err));
      }
    };

    const setup = async () => {
      try {
        const filePath = await getFilePath();
        const initial = await readClipboard(true, filePath).catch(() => null);
        if (initial?.files?.value.files.length) {
          lastSig = `files_${initial.files.value.files.map((f) => `${f.path}_${f.size}`).join("|")}`;
        } else if (initial?.text?.value) {
          lastSig = initial.text.value;
        } else if (initial?.image?.value.path) {
          lastSig = `img_${initial.image.value.width}x${initial.image.value.height}`;
        }
        await startWatch();
        unlisten = await onClipboardChange(handleClipboardChange, {
          imageAutoSave: true,
          filePath,
        });
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
    };
  }, []);
}
