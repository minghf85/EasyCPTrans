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
        const r = await api.ingest("text", text);
        if (!r.accepted) {
          console.log("dropped:", r.droppedBy, r.reason);
        }
      } catch (e) {
        onErrorRef.current("Ingest error: " + String(e));
      }
    };

    const ingestImage = async (dataUrl: string) => {
      try {
        const r = await api.ingest("image", dataUrl);
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
                   lastSig = sig;
                   await ingestImage(dataUrl);
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
