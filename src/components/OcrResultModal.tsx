import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Languages,
  RefreshCw,
  ScanText,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { fetchImageDataUrl } from "../lib/imageCache";
import { tr, type Locale } from "../lib/i18n";
import type { HistoryItem } from "../types";

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
      className="eacptrans-modal-overlay fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void handleClose();
      }}
    >
      <div className="eacptrans-modal-panel eacptrans-ocr-panel">
        <div className="eacptrans-ocr-head">
          <span className="eacptrans-ocr-head-title">
            <ScanText className="h-4 w-4" />
            {tr(locale, "ocrPanelTitle")}
          </span>
          {languageLabel && <span className="eacptrans-ocr-head-meta">{languageLabel}</span>}
          {hasText && (
            <span className="eacptrans-ocr-head-meta">
              {count} {tr(locale, "ocrCharUnit")}
            </span>
          )}
          <button className="eacptrans-ocr-close" onClick={() => void handleClose()} title="Esc">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="eacptrans-ocr-body">
          <div className="eacptrans-ocr-preview">
            {imageSrc ? (
              <img src={imageSrc} alt="" />
            ) : (
              <div className="eacptrans-ocr-preview-empty">
                <ScanText className="h-6 w-6" />
              </div>
            )}
          </div>

          {emptyResult && !hasText ? (
            <div className="eacptrans-ocr-empty">
              <p className="eacptrans-ocr-empty-title">
                {busy ? tr(locale, "ocrRunning") : tr(locale, "ocrNoText")}
              </p>
              <p className="eacptrans-ocr-empty-hint">
                {languages.length === 0
                  ? tr(locale, "ocrNoLanguagePack")
                  : `${tr(locale, "ocrInstalledLanguages")}: ${languages
                      .map((entry) => entry.tag)
                      .join(", ")}`}
              </p>
            </div>
          ) : (
            <div className="eacptrans-ocr-text">
              <textarea
                value={text}
                spellCheck={false}
                onChange={(event) => setText(event.target.value)}
                onBlur={() => void persist()}
              />
              <span className="eacptrans-ocr-hint">{tr(locale, "ocrEditHint")}</span>
            </div>
          )}
        </div>

        <div className="eacptrans-ocr-actions">
          {languages.length > 0 && (
            <select
              className="eacptrans-ocr-lang"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              title={tr(locale, "ocrLanguage")}
            >
              <option value="">{tr(locale, "ocrLanguageAuto")}</option>
              {languages.map((entry) => (
                <option key={entry.tag} value={entry.tag}>
                  {entry.name} ({entry.tag})
                </option>
              ))}
            </select>
          )}

          <div className="eacptrans-ocr-action-buttons">
            <button className="eacptrans-ocr-btn" onClick={() => void handleCopy()} disabled={!hasText}>
              <Copy className="h-3.5 w-3.5" />
              {tr(locale, "ocrCopyText")}
            </button>
            <button className="eacptrans-ocr-btn" onClick={() => void handlePaste()} disabled={!hasText}>
              <Check className="h-3.5 w-3.5" />
              {tr(locale, "ocrPasteText")}
            </button>
            <button className="eacptrans-ocr-btn" onClick={() => void handleSaveAsItem()} disabled={!hasText}>
              <ScanText className="h-3.5 w-3.5" />
              {savedAsItem ? tr(locale, "ocrSavedAsItem") : tr(locale, "ocrSaveAsItem")}
            </button>
            {apiTranslateEnabled && (
              <button className="eacptrans-ocr-btn" onClick={() => void handleTranslate()} disabled={!hasText}>
                <Languages className="h-3.5 w-3.5" />
                {tr(locale, "ocrTranslate")}
              </button>
            )}
            <button
              className="eacptrans-ocr-btn primary"
              onClick={() => void handleRecognize()}
              disabled={busy}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              {busy ? tr(locale, "ocrRunning") : tr(locale, "ocrRetry")}
            </button>
          </div>

          {savedFlash ? (
            <span className="eacptrans-ocr-saved">
              <Check className="h-3 w-3" />
              {tr(locale, "ocrSaved")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
