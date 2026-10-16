import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Languages, RefreshCw, ScanText, X } from "lucide-react";
import { api } from "../lib/api";
import { fetchImageDataUrl } from "../lib/imageCache";
import { tr, type Locale } from "../lib/i18n";
import type { HistoryItem } from "../types";
import { buttonPrimary, buttonSecondary, focusRing, iconButton, inset, modalPanel, overlay } from "./ui";

interface Props {
  item: HistoryItem;
  locale: Locale;
  /** Text to show on open: a fresh OCR result or the text stored earlier. */
  initialText: string;
  apiTranslateEnabled: boolean;
  onClose: () => void;
  onCopyText: (text: string) => void;
  onPasteText: (text: string) => void;
  onSavedAsItem: (itemId: number) => void;
  onNotify: (message: string) => void;
}

function charCount(text: string) {
  return text.trim().length;
}

/** Compact secondary action used across the OCR footer. */
const ocrAction = `${buttonSecondary} px-3 py-2 text-xs`;

export function OcrResultModal({
  item,
  locale,
  initialText,
  apiTranslateEnabled,
  onClose,
  onCopyText,
  onPasteText,
  onSavedAsItem,
  onNotify,
}: Props) {
  const [text, setText] = useState(initialText);
  const [imageSrc, setImageSrc] = useState<string | null>(item.content || null);
  const [busy, setBusy] = useState(false);
  const [emptyResult, setEmptyResult] = useState(!initialText.trim());
  const [languages, setLanguages] = useState<Array<{ tag: string; name: string }>>([]);
  const [language, setLanguage] = useState("");
  const [savedAsItem, setSavedAsItem] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const savedTextRef = useRef(initialText);
  const textRef = useRef(text);
  textRef.current = text;

  const imageRequestedRef = useRef(item.contentType !== "image");

  useEffect(() => {
    if (imageRequestedRef.current || item.contentType !== "image") return;
    imageRequestedRef.current = true;
    void fetchImageDataUrl(item.id, api.getImageContent)
      .then((dataUrl) => setImageSrc(dataUrl))
      .catch(() => setImageSrc(""));
  }, [item.contentType, item.id]);

  useEffect(() => {
    void api
      .listOcrLanguages()
      .then((list) => setLanguages(list))
      .catch(() => setLanguages([]));
    void api
      .getConfig()
      .then((cfg) => setLanguage(cfg?.ocrLanguage ?? ""))
      .catch(() => {});
  }, []);

  // Closing the panel in any way (button, Escape, backdrop) must not drop edits.
  useEffect(() => {
    return () => {
      const current = textRef.current;
      if (current.trim() && current !== savedTextRef.current) {
        void api.setOcrText(item.id, current).catch(() => {});
      }
    };
  }, [item.id]);

  const persist = useCallback(async () => {
    const current = textRef.current;
    if (!current.trim() || current === savedTextRef.current) return;
    try {
      await api.setOcrText(item.id, current);
      savedTextRef.current = current;
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      onNotify(`${tr(locale, "ocrFailed")}${String(err)}`);
    }
  }, [item.id, locale, onNotify]);

  const handleClose = async () => {
    await persist();
    onClose();
  };

  const handleRecognize = async (nextLanguage?: string) => {
    setBusy(true);
    setSavedAsItem(false);
    try {
      const result = await api.ocrImageItem(item.id, nextLanguage ?? language ?? undefined);
      setText(result);
      savedTextRef.current = result;
      setEmptyResult(false);
    } catch (err) {
      setEmptyResult(true);
      onNotify(`${tr(locale, "ocrFailed")}${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    await persist();
    onCopyText(textRef.current);
  };

  const handlePaste = async () => {
    await persist();
    onPasteText(textRef.current);
  };

  const handleSaveAsItem = async () => {
    await persist();
    try {
      const newId = await api.createTextItemFromOcr(item.id);
      setSavedAsItem(true);
      onSavedAsItem(newId);
    } catch (err) {
      onNotify(String(err));
    }
  };

  const handleTranslate = async () => {
    await persist();
    try {
      await api.translateTextApi(textRef.current);
      onNotify(tr(locale, "ocrTranslating"));
    } catch (err) {
      onNotify(`${tr(locale, "ocrFailed")}${String(err)}`);
    }
  };

  const languageLabel = useMemo(() => {
    const stored = item.metadata?.ocrLanguageName?.[0] || item.metadata?.ocrLanguage?.[0];
    return stored || "";
  }, [item.metadata]);

  const count = charCount(text);
  const hasText = count > 0;

  return (
    <div
      className={overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void handleClose();
      }}
    >
      <div className={`${modalPanel} flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col`}>
        <header className="flex items-center gap-3 border-b border-gray-200 p-4">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"
            aria-hidden
          >
            <ScanText className="h-4 w-4" />
          </span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-gray-900">
            {tr(locale, "ocrPanelTitle")}
          </h2>
          {languageLabel && (
            <span className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
              {languageLabel}
            </span>
          )}
          {hasText && (
            <span className="shrink-0 text-xs text-gray-500">
              {count} {tr(locale, "ocrCharUnit")}
            </span>
          )}
          <button
            type="button"
            className={`h-8 w-8 ${iconButton}`}
            onClick={() => void handleClose()}
            title="Esc"
            aria-label={tr(locale, "close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="eacp-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row">
          <div className={`flex w-full shrink-0 items-start justify-center overflow-hidden p-2 md:w-56 ${inset}`}>
            {imageSrc ? (
              <img src={imageSrc} alt="" className="max-h-56 w-full rounded object-contain" />
            ) : (
              <div className="flex h-32 w-full items-center justify-center text-gray-400">
                <ScanText className="h-6 w-6" aria-hidden />
              </div>
            )}
          </div>

          {emptyResult && !hasText ? (
            <div className={`flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center ${inset}`}>
              <p className="text-sm font-medium text-gray-700">
                {busy ? tr(locale, "ocrRunning") : tr(locale, "ocrNoText")}
              </p>
              <p className="text-xs text-gray-500">
                {languages.length === 0
                  ? tr(locale, "ocrNoLanguagePack")
                  : `${tr(locale, "ocrInstalledLanguages")}: ${languages
                      .map((entry) => entry.tag)
                      .join(", ")}`}
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <textarea
                value={text}
                spellCheck={false}
                onChange={(event) => setText(event.target.value)}
                onBlur={() => void persist()}
                className={`eacp-scroll min-h-[180px] flex-1 resize-none font-mono text-sm leading-6 ${inset} p-3 ${focusRing}`}
              />
              <span className="text-xs text-gray-500">{tr(locale, "ocrEditHint")}</span>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-gray-200 p-4">
          {languages.length > 0 && (
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              title={tr(locale, "ocrLanguage")}
              aria-label={tr(locale, "ocrLanguage")}
              className={`w-auto px-3 py-2 text-xs ${inset} ${focusRing} focus:border-blue-500`}
            >
              <option value="">{tr(locale, "ocrLanguageAuto")}</option>
              {languages.map((entry) => (
                <option key={entry.tag} value={entry.tag}>
                  {entry.name} ({entry.tag})
                </option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <button type="button" className={ocrAction} onClick={() => void handleCopy()} disabled={!hasText}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {tr(locale, "ocrCopyText")}
            </button>
            <button type="button" className={ocrAction} onClick={() => void handlePaste()} disabled={!hasText}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              {tr(locale, "ocrPasteText")}
            </button>
            <button type="button" className={ocrAction} onClick={() => void handleSaveAsItem()} disabled={!hasText}>
              <ScanText className="h-3.5 w-3.5" aria-hidden />
              {savedAsItem ? tr(locale, "ocrSavedAsItem") : tr(locale, "ocrSaveAsItem")}
            </button>
            {apiTranslateEnabled && (
              <button type="button" className={ocrAction} onClick={() => void handleTranslate()} disabled={!hasText}>
                <Languages className="h-3.5 w-3.5" aria-hidden />
                {tr(locale, "ocrTranslate")}
              </button>
            )}
            <button
              type="button"
              className={`${buttonPrimary} px-3 py-2 text-xs`}
              onClick={() => void handleRecognize()}
              disabled={busy}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
              {busy ? tr(locale, "ocrRunning") : tr(locale, "ocrRetry")}
            </button>
          </div>

          {savedFlash && (
            <span
              role="status"
              className="inline-flex items-center gap-1 text-xs font-medium text-green-700"
            >
              <Check className="h-3 w-3" aria-hidden />
              {tr(locale, "ocrSaved")}
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
