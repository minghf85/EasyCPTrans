import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Regex, RotateCw } from "lucide-react";
import { api } from "../lib/api";
import { tr, type I18nKey, type Locale } from "../lib/i18n";
import { getTagDisplayName } from "../lib/tagDisplay";
import type { ManagedTag } from "../types";
import { buttonPrimary, buttonSecondary, focusRing, inputMono, overlay, transition } from "./ui";

/**
 * The editor for one tag's regex rule.
 *
 * A drawer rather than an inline form: the rule needs a place to be tried out,
 * and a form squeezed between the tag's colour swatch and its delete button has
 * no room for one. The trial panel is the point of the screen — a pattern that
 * compiles is not the same as a pattern that matches anything, and the only way
 * to tell the difference is to run it against real content.
 */

/** Starting points for the editor. Rust's `regex` crate has no lookaround or
 * backreferences, so every preset has to compile there. */
const PATTERN_PRESETS: Array<{ labelKey: I18nKey; pattern: string }> = [
  { labelKey: "tagPresetLink", pattern: "https?://[^\\s<>\"')]+" },
  { labelKey: "tagPresetEmail", pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+" },
  { labelKey: "tagPresetPhone", pattern: "\\b(?:\\+?\\d{1,3}[-.\\s]?)?\\(?\\d{2,4}\\)?[-.\\s]?\\d{3,4}[-.\\s]?\\d{3,4}\\b" },
  { labelKey: "tagPresetPath", pattern: "[A-Za-z]:\\\\[^\\s\"<>|?*]+" },
  { labelKey: "tagPresetIp", pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b" },
  { labelKey: "tagPresetColor", pattern: "#[0-9a-fA-F]{6}\\b" },
];

interface PreviewState {
  matches: string[];
  total: number;
  truncated: boolean;
  segments: Array<{ text: string; matched: boolean }>;
  scanned: number;
  skipped: number;
}

interface Props {
  tag: ManagedTag;
  locale: Locale;
  /** The page's own busy flag; the drawer only adds its own on top. */
  busy: boolean;
  onSave: (
    tag: string,
    pattern: string | null,
    ignoreCase: boolean,
    extract: boolean,
  ) => Promise<void>;
  onClose: () => void;
}

export function TagRuleDrawer({ tag, locale, busy, onSave, onClose }: Props) {
  const [pattern, setPattern] = useState(tag.pattern ?? "");
  const [ignoreCase, setIgnoreCase] = useState(Boolean(tag.ignoreCase));
  const [extract, setExtract] = useState(Boolean(tag.extract));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  /** The text the rule is tried against. Empty means "ask the history instead". */
  const [sample, setSample] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewScope, setPreviewScope] = useState<"sample" | "history" | null>(null);
  const requestRef = useRef(0);

  const trimmed = pattern.trim();
  const canExtract = trimmed !== "";

  const runPreview = async (scope: "sample" | "history") => {
    const ticket = requestRef.current + 1;
    requestRef.current = ticket;
    if (trimmed === "") {
      setPreview(null);
      setPreviewScope(null);
      setPreviewError("");
      return;
    }

    setPreviewBusy(true);
    setPreviewError("");
    try {
      const result = await api.previewTagPattern(
        trimmed,
        ignoreCase,
        scope === "sample" ? sample : undefined,
      );
      // A slower earlier request must not overwrite a newer answer.
      if (requestRef.current !== ticket) return;
      setPreview(result);
      setPreviewScope(scope);
    } catch (err) {
      if (requestRef.current !== ticket) return;
      setPreview(null);
      setPreviewScope(null);
      setPreviewError(String(err));
    } finally {
      if (requestRef.current === ticket) setPreviewBusy(false);
    }
  };

  // Typing a sample is the live path: it is local, cheap and the answer arrives
  // while the cursor is still moving. Scanning the history is a button, because
  // it reads real rows.
  useEffect(() => {
    if (trimmed === "" || sample.trim() === "") return;
    const timer = window.setTimeout(() => void runPreview("sample"), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, ignoreCase, sample]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const save = async () => {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      // Compiling on the Rust side is the same check the ingest pipeline makes,
      // so a pattern that passes here cannot fail silently later.
      await api.validateTagPattern(trimmed, ignoreCase);
      await onSave(tag.name, trimmed || null, ignoreCase, extract && canExtract);
      onClose();
    } catch (err) {
      setError(tr(locale, "tagPatternInvalid") + String(err));
    } finally {
      setSaving(false);
    }
  };

  const scopeNotes: Array<{ key: I18nKey; ok: boolean }> = [
    { key: "tagRuleScopeText", ok: true },
    { key: "tagRuleScopeFile", ok: true },
    { key: "tagRuleScopeImage", ok: true },
    { key: "tagRuleScopeNever", ok: false },
  ];

  return createPortal(
    <div
      className={`${overlay} z-[70]`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${tr(locale, "tagPattern")} · #${getTagDisplayName(tag.name, locale)}`}
        className="eacp-scroll flex max-h-[min(640px,calc(100vh-48px))] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl"
      >
        <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Regex className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold tracking-tight text-gray-900">
              #{getTagDisplayName(tag.name, locale)}
            </span>
            <span className="block truncate text-xs text-gray-500">
              {tr(locale, "tagPattern")}
            </span>
          </span>
          <button
            type="button"
            className={buttonSecondary}
            onClick={onClose}
            disabled={saving}
          >
            {tr(locale, "close")}
          </button>
        </header>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {/* ── the rule ── */}
          <section className="space-y-3">
            <label className="block text-sm font-medium text-gray-700" htmlFor={`tag-pattern-${tag.name}`}>
              {tr(locale, "tagPattern")}
            </label>
            <input
              id={`tag-pattern-${tag.name}`}
              autoFocus
              value={pattern}
              onChange={(event) => {
                setPattern(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
              placeholder={tr(locale, "tagPatternPlaceholder")}
              disabled={saving}
              spellCheck={false}
              aria-invalid={Boolean(error)}
              className={`${inputMono} ${error ? "border-red-500 focus:border-red-500 focus:ring-red-500/25" : ""}`}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`${buttonSecondary} ${ignoreCase ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`}
                onClick={() => setIgnoreCase((prev) => !prev)}
                disabled={saving}
                aria-pressed={ignoreCase}
              >
                {ignoreCase && <Check className="h-4 w-4" aria-hidden />}
                Aa {tr(locale, "tagIgnoreCase")}
              </button>
              <button
                type="button"
                className={`${buttonSecondary} ${extract ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`}
                onClick={() => setExtract((prev) => !prev)}
                disabled={saving || !canExtract}
                aria-pressed={extract}
                title={canExtract ? undefined : tr(locale, "tagPatternHint")}
              >
                {extract && <Check className="h-4 w-4" aria-hidden />}
                {tr(locale, "tagExtract")}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">{tr(locale, "tagPresets")}</span>
              {PATTERN_PRESETS.map((preset) => (
                <button
                  key={preset.labelKey}
                  type="button"
                  onClick={() => {
                    setPattern(preset.pattern);
                    setError("");
                  }}
                  disabled={saving}
                  className={`inline-flex items-center rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 ${transition} hover:border-blue-500 hover:border-solid hover:text-blue-700 ${focusRing}`}
                >
                  {tr(locale, preset.labelKey)}
                </button>
              ))}
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : (
              <p className="text-sm text-gray-500">{tr(locale, "tagPatternHint")}</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button type="button" className={buttonPrimary} onClick={() => void save()} disabled={saving || busy}>
                {tr(locale, "save")}
              </button>
              <button type="button" className={buttonSecondary} onClick={onClose} disabled={saving}>
                {tr(locale, "cancel")}
              </button>
            </div>
          </section>

          {/* ── try it out ── */}
          <section className="space-y-3">
            <span className="block text-sm font-medium text-gray-700">
              {tr(locale, "tagRuleTrial")}
            </span>
            <textarea
              value={sample}
              onChange={(event) => setSample(event.target.value)}
              placeholder={tr(locale, "tagRuleSamplePlaceholder")}
              rows={4}
              spellCheck={false}
              className={`${inputMono} resize-y`}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => void runPreview("history")}
                disabled={previewBusy || trimmed === ""}
              >
                <RotateCw className={`h-4 w-4 ${previewBusy && previewScope !== "sample" ? "animate-spin" : ""}`} aria-hidden />
                {tr(locale, "tagRuleRunHistory")}
              </button>
              {preview && (
                <span className="text-xs text-gray-500">
                  {previewScope === "sample"
                    ? `${preview.total} ${tr(locale, "tagRuleMatches")}`
                    : `${preview.scanned} ${tr(locale, "tagRuleScanned")} · ${preview.total} ${tr(locale, "tagRuleMatches")} · ${preview.skipped} ${tr(locale, "tagRuleSkipped")}`}
                </span>
              )}
            </div>

            {previewError && (
              <p role="alert" className="text-sm text-red-600">
                {previewError}
              </p>
            )}

            {preview && previewScope === "sample" && preview.segments.length > 0 && (
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-700 eacp-scroll">
                {preview.segments.map((segment, index) =>
                  segment.matched ? (
                    <mark key={index} className="rounded bg-blue-100 px-0.5 text-blue-800">
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </div>
            )}

            {preview && previewScope === "history" && (
              <div className="space-y-2">
                {preview.matches.length === 0 ? (
                  <p className="text-sm text-gray-500">{tr(locale, "tagRulePreviewEmpty")}</p>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-2 font-mono text-xs text-gray-700 eacp-scroll">
                    {preview.matches.map((value) => (
                      <li key={value} className="truncate rounded px-1 py-0.5">
                        {value}
                      </li>
                    ))}
                  </ul>
                )}
                {preview.truncated && (
                  <p className="text-xs text-amber-600">{tr(locale, "tagRuleTruncated")}</p>
                )}
              </div>
            )}

            {/* Which content this rule will actually see. The question "can this
                apply to an image?" has an answer, and it belongs on screen. */}
            <div className="space-y-1.5 rounded-lg bg-gray-50 p-3">
              <span className="block text-xs font-medium text-gray-700">
                {tr(locale, "tagRuleScope")}
              </span>
              <ul className="space-y-1">
                {scopeNotes.map((note) => (
                  <li key={note.key} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <span className={note.ok ? "text-green-600" : "text-gray-400"} aria-hidden>
                      {note.ok ? "✓" : "✕"}
                    </span>
                    {tr(locale, note.key)}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
