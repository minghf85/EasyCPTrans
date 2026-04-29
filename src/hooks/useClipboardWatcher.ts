import { useEffect, useRef } from "react";
import { readImage, readText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "../lib/api";

export let injectedOverrideSig: string | null = null;
export function setInjectedOverrideSig(sig: string | null) {
  injectedOverrideSig = sig;
}

export function useClipboardWatcher(
  intervalMs: number,
  onError: (msg: string) => void,
) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let lastSig = "";
    let cancelled = false;

    const ingestText = async (text: string) => {
      try {
        const metadata = { length: [text.length.toString()] };
        const win = await api.getActiveWindow();
        const r = await api.ingest("text", text, metadata, win);
        if (!r.accepted) {
          console.log("dropped:", r.droppedBy, r.reason);
        }
      } catch (e) {
        onErrorRef.current("Ingest error: " + String(e));
      }
    };

    const ingestImage = async (dataUrl: string, width: number, height: number, byteLength: number) => {
      try {
        const metadata = {
          width: [width.toString()],
          height: [height.toString()],
          size: [byteLength.toString()],
        };
        const win = await api.getActiveWindow();
        const r = await api.ingest("image", dataUrl, metadata, win);
        if (!r.accepted) {
          console.log("dropped:", r.droppedBy, r.reason);
        }
      } catch (e) {
        onErrorRef.current("Ingest error: " + String(e));
      }
    };

        const ingestFile = async (files: { path: string; size: number }[]) => {
      try {
        const fileLines = files.map((f) => f.path).join("\n");
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        const sizes = files.map((f) => f.size.toString());
        const metadata = { count: [files.length.toString()], totalSize: [totalSize.toString()], sizes };
        const win = await api.getActiveWindow();
        const r = await api.ingest("file", fileLines, metadata, win);
        if (!r.accepted) {
          console.log("dropped:", r.droppedBy, r.reason);
        }
      } catch (e) {
        onErrorRef.current("Ingest error: " + String(e));
      }
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        if (injectedOverrideSig !== null) {
          lastSig = injectedOverrideSig;
          injectedOverrideSig = null;
        }

        // 文件
        try {
          const files = await api.readFiles();
          if (files && files.length > 0) {
            const sig = "files_" + files.map((f) => f.path + "_" + f.size).join("|");
            if (sig !== lastSig) {
              lastSig = sig;
              await ingestFile(files);
              return;
            }
            // 不要返回，因为有可能Windows下既有文件又有文字
          }
        } catch {
        }

        // 文本
        try {
          const text = await readText();
          if (text && text !== lastSig) {
            lastSig = text;
            await ingestText(text);
            return;
          }
        } catch {
        }

        // ����ͼƬ
        try {
          const img = await readImage();
          if (img) {
            const size = await img.size();
            // FAST PATH: Only use size as the signature to avoid transferring massive RGBA buffers over IPC every 500ms!
            const sig = `img_${size.width}x${size.height}`;
            if (sig !== lastSig) {
              const rgba = await img.rgba(); // Only grab buffer if size changed
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (ctx) {
                // Resize if too large
                const MAX_DIM = 600;
                let targetWidth = size.width;
                let targetHeight = size.height;
                if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
                    const ratio = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight);
                    targetWidth = Math.floor(targetWidth * ratio);
                    targetHeight = Math.floor(targetHeight * ratio);
                }

                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = size.width;
                tempCanvas.height = size.height;
                const tempCtx = tempCanvas.getContext("2d");
                if (tempCtx) {
                   tempCtx.putImageData(
                     new ImageData(
                       new Uint8ClampedArray(rgba),
                       size.width,
                       size.height,
                     ),
                     0,
                     0,
                   );

                   canvas.width = targetWidth;
                   canvas.height = targetHeight;
                   ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
                   const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                   const byteLen = Math.round((dataUrl.length * 3) / 4);
                   lastSig = sig;
                   await ingestImage(dataUrl, targetWidth, targetHeight, byteLen);
                }
              }
            }
          }
        } catch {
        }
      } catch (err: any) {
        const s = String(err);
        if (!s.includes("empty") && !s.includes("not available")) {
          onErrorRef.current("Clipboard error: " + (err?.message ?? s));
        }
      }
    };

    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
