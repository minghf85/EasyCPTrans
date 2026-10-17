import { useMemo, useState } from "react";
import { Link2, Mail, MapPin, Palette, Pencil, Phone, Plus, Regex, Star, Tag, Trash2 } from "lucide-react";
import { tr, type I18nKey, type Locale } from "../lib/i18n";
import { getTagDisplayName } from "../lib/tagDisplay";
import type { ManagedTag } from "../types";
import { TagRuleDrawer } from "./TagRuleDrawer";
import {
  buttonPrimary,
  buttonSecondary,
  input,
  surface,
  surfaceInteractive,
  transition,
} from "./ui";

/**
 * Ready-to-use regex rules for common content types.
 *
 * Each preset defines a tag name (stored in English), a display name key (localized),
 * color, and pattern. When enabled, the tag is created (if needed) with the English
 * name but displayed using the localized string.
 */
interface QuickRulePreset {
  /** Display name key for localization */
  nameKey: I18nKey;
  descKey: I18nKey;
  /** English tag name for backend storage */
  tagName: string;
  color: string;
  pattern: string;
  ignoreCase: boolean;
  icon: typeof Link2;
}

const QUICK_RULE_PRESETS: QuickRulePreset[] = [
  {
    nameKey: "tagPresetLink",
    descKey: "tagPresetLink",
    tagName: "Link",
    color: "#2563eb",
    pattern: "https?://[^\\s<>\"')]+",
    ignoreCase: false,
    icon: Link2,
  },
  {
    nameKey: "tagPresetEmail",
    descKey: "tagPresetEmail",
    tagName: "Email",
    color: "#16a34a",
    pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+",
    ignoreCase: true,
    icon: Mail,
  },
  {
    nameKey: "tagPresetPhone",
    descKey: "tagPresetPhone",
    tagName: "Phone",
    color: "#ea580c",
    pattern: "\\b(?:\\+?\\d{1,3}[-.\\s]?)?\\(?\\d{2,4}\\)?[-.\\s]?\\d{3,4}[-.\\s]?\\d{3,4}\\b",
    ignoreCase: false,
    icon: Phone,
  },
  {
    nameKey: "tagPresetPath",
    descKey: "tagPresetPath",
    tagName: "Path",
    color: "#64748b",
    pattern: "[A-Za-z]:\\\\[^\\s\"<>|?*]+",
    ignoreCase: false,
    icon: MapPin,
  },
  {
    nameKey: "tagPresetIp",
    descKey: "tagPresetIp",
    tagName: "IP",
    color: "#7c3aed",
    pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
    ignoreCase: false,
    icon: MapPin,
  },
  {
    nameKey: "tagPresetColor",
    descKey: "tagPresetColor",
    tagName: "Color",
    color: "#db2777",
    pattern: "#[0-9a-fA-F]{6}\\b",
    ignoreCase: false,
    icon: Palette,
  },
];

interface Props {
  tags: ManagedTag[];
  tagCounts: Map<string, number>;
  busy: boolean;
  onCreate: (tag: string) => Promise<void>;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (tag: string) => Promise<void>;
  onToggleCommon: (tag: string) => Promise<void>;
  onSetColor: (tag: string, color: string) => Promise<void>;
  onSetPattern: (
    tag: string,
    pattern: string | null,
    ignoreCase: boolean,
    extract: boolean,
  ) => Promise<void>;
  /** Atomic create-or-update for quick rules: avoids race between onCreate and onSetPattern. */
  onEnableQuickRule: (
    tagName: string,
    color: string,
    pattern: string,
    ignoreCase: boolean,
  ) => Promise<void>;
  locale: Locale;
}

export function TagManagementPage({
  tags,
  tagCounts,
  busy,
  onCreate,
  onRename,
  onDelete,
  onToggleCommon,
  onSetColor,
  onSetPattern,
  onEnableQuickRule,
  locale,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [message, setMessage] = useState("");

  /** The tag whose rule drawer is open, if any. */
  const [ruleTag, setRuleTag] = useState<string | null>(null);
  const ruleTagData = useMemo(
    () => (ruleTag ? tags.find((entry) => entry.name === ruleTag) ?? null : null),
    [ruleTag, tags],
  );

  /** Find which preset tags already exist and have a pattern set. */
  const presetStatus = useMemo(() => {
    const map = new Map<string, { enabled: boolean; tag: ManagedTag | null }>();
    for (const preset of QUICK_RULE_PRESETS) {
      const existing = tags.find((t) => t.name.toLowerCase() === preset.tagName.toLowerCase());
      map.set(preset.tagName, {
        enabled: Boolean(existing?.pattern),
        tag: existing ?? null,
      });
    }
    return map;
  }, [tags]);

  const sortedTags = useMemo(
    () =>
      [...tags].sort(
        (a, b) =>
          Number(b.common) - Number(a.common) ||
          Number(Boolean(b.system)) - Number(Boolean(a.system)) ||
          (tagCounts.get(b.name) ?? 0) - (tagCounts.get(a.name) ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [tags, tagCounts],
  );

  const handleCreate = async () => {
    const value = draft.trim();
    if (!value) return;
    setMessage("");
    try {
      await onCreate(value);
      setDraft("");
      setMessage(tr(locale, "tagCreated"));
    } catch (err) {
      setMessage(String(err));
    }
  };

  const handleRename = async () => {
    if (!editingTag) return;
    const value = editingValue.trim();
    if (!value) return;
    setMessage("");
    try {
      await onRename(editingTag, value);
      setEditingTag(null);
      setEditingValue("");
      setMessage(tr(locale, "tagRenamed"));
    } catch (err) {
      setMessage(String(err));
    }
  };

  const cancelRename = () => {
    setEditingTag(null);
    setEditingValue("");
    setMessage("");
  };

  const isDeviceTag = (tag: ManagedTag) => tag.id?.startsWith("sys-device-") ?? false;

  return (
    <div className="eacp-animate-fade space-y-6">
      <section className={`${surface} p-6`}>
        <header className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
            <Tag className="h-5 w-5 text-blue-600" aria-hidden />
            {tr(locale, "tagManagement")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{tr(locale, "tagIntro")}</p>
        </header>

        <label className="block text-sm font-medium text-gray-700" htmlFor="new-tag-input">
          {tr(locale, "newTag")}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            id="new-tag-input"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
            }}
            placeholder={tr(locale, "enterTagName")}
            disabled={busy}
            className={`max-w-md flex-1 ${input}`}
          />
          <button
            type="button"
            className={buttonPrimary}
            onClick={() => void handleCreate()}
            disabled={busy || !draft.trim()}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {tr(locale, "addTag")}
          </button>
        </div>

        {message && (
          <p role="status" className="mt-3 text-sm text-gray-600">
            {message}
          </p>
        )}
      </section>

      {/* ── Quick Rules ── */}
      <section className={`${surface} p-6`}>
        <header className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
            <Regex className="h-5 w-5 text-blue-600" aria-hidden />
            {tr(locale, "quickRules")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{tr(locale, "quickRulesDesc")}</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_RULE_PRESETS.map((preset) => {
            const status = presetStatus.get(preset.tagName);
            const enabled = status?.enabled ?? false;
            const displayName = getTagDisplayName(preset.tagName, locale);
            const Icon = preset.icon;

            return (
              <div
                key={preset.tagName}
                className={`flex items-start gap-3 rounded-xl border p-4 ${transition} ${
                  enabled
                    ? "border-blue-300 bg-blue-50/50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${preset.color}18`, color: preset.color }}
                  aria-hidden
                >
                  <Icon className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {displayName}
                  </h3>
                  <p className="mt-0.5 truncate font-mono text-xs text-gray-500" title={preset.pattern}>
                    {preset.pattern}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (enabled) {
                        // Disable: remove the pattern but keep the tag
                        void onSetPattern(preset.tagName, null, false, false);
                      } else {
                        // Enable: create tag with pattern in one atomic operation
                        void onEnableQuickRule(preset.tagName, preset.color, preset.pattern, preset.ignoreCase);
                      }
                    }}
                    disabled={busy}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${transition} ${
                      enabled
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "border border-gray-300 bg-white text-gray-700 hover:border-blue-500 hover:text-blue-700"
                    }`}
                  >
                    {enabled ? tr(locale, "quickRuleEnabled") : tr(locale, "quickRuleEnable")}
                  </button>
                  {enabled && (
                    <button
                      type="button"
                      onClick={() => setRuleTag(preset.tagName)}
                      disabled={busy}
                      title={tr(locale, "quickRuleCustomize")}
                      className={`rounded-lg p-1.5 text-gray-500 ${transition} hover:bg-gray-100 hover:text-gray-700`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${surface} p-6`}>
        <header className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            {tr(locale, "existingTags")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{tr(locale, "existingTagsDesc")}</p>
        </header>

        {sortedTags.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">{tr(locale, "noTags")}</p>
        ) : (
          <ul className="space-y-3">
            {sortedTags.map((tag) => {
              const count = tagCounts.get(tag.name) ?? 0;
              const editing = editingTag === tag.name;
              const deviceTag = isDeviceTag(tag);
              const canRename = deviceTag || !tag.system;
              const ruleOpen = ruleTag === tag.name;
              // System tags are maintained by the app and device tags are derived
              // from history: a pattern on either would award itself to unrelated
              // content — an `Image` rule would tag every text item mentioning it.
              const canHaveRule = !tag.system && !deviceTag;

              return (
                <li key={tag.name} className={`${surface} ${surfaceInteractive} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-lg px-2 py-0.5 text-sm font-medium"
                          style={{ backgroundColor: `${tag.color}18`, color: tag.color }}
                        >
                          #{getTagDisplayName(tag.name, locale)}
                        </span>
                        <span className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {deviceTag
                            ? tr(locale, "deviceName")
                            : tag.system
                              ? tr(locale, "functional")
                              : tr(locale, "custom")}
                        </span>
                        {tag.pattern && (
                          <span
                            title={tag.pattern}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                          >
                            <Regex className="h-3 w-3" aria-hidden />
                            {tr(locale, "tagRule")}
                            {tag.extract ? ` · ${tr(locale, "tagExtract")}` : ""}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {count} {tr(locale, "itemCount")} ·{" "}
                        {tag.common ? tr(locale, "topBar") : tr(locale, "hidden")}
                      </p>
                    </div>

                    {editing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={editingValue}
                          onChange={(event) => {
                            setEditingValue(event.target.value);
                            setMessage("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void handleRename();
                            if (event.key === "Escape") cancelRename();
                          }}
                          disabled={busy}
                          className={`w-48 ${input}`}
                        />
                        <button
                          type="button"
                          className={buttonPrimary}
                          onClick={() => void handleRename()}
                          disabled={busy || !editingValue.trim()}
                        >
                          {tr(locale, "save")}
                        </button>
                        <button type="button" className={buttonSecondary} onClick={cancelRename} disabled={busy}>
                          {tr(locale, "cancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {canHaveRule && (
                          <button
                            type="button"
                            className={`${buttonSecondary} ${
                              ruleOpen ? "border-blue-300 bg-blue-50 text-blue-700" : ""
                            }`}
                            onClick={() => setRuleTag(ruleOpen ? null : tag.name)}
                            disabled={busy}
                            title={tr(locale, "tagPatternHint")}
                            aria-expanded={ruleOpen}
                          >
                            <Regex className="h-4 w-4" aria-hidden />
                            {tr(locale, "tagPattern")}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${buttonSecondary} ${tag.common ? "border-blue-500 bg-blue-50 text-blue-700" : ""}`}
                          onClick={() => void onToggleCommon(tag.name)}
                          disabled={busy}
                          aria-pressed={tag.common}
                          title={tag.common ? tr(locale, "hideFromTopBar") : tr(locale, "showInTopBar")}
                        >
                          <Star className="h-4 w-4" aria-hidden />
                          {tag.common ? tr(locale, "topBar") : tr(locale, "hidden")}
                        </button>
                        <label
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition duration-200 ease-out hover:bg-gray-50"
                          title={tr(locale, "color")}
                        >
                          <input
                            type="color"
                            value={tag.color}
                            onChange={(event) => void onSetColor(tag.name, event.target.value)}
                            disabled={busy}
                            className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <span className="font-mono text-xs">{tag.color}</span>
                        </label>
                        <button
                          type="button"
                          className={buttonSecondary}
                          onClick={() => {
                            if (!canRename) return;
                            setEditingTag(tag.name);
                            setEditingValue(tag.name);
                            setMessage("");
                          }}
                          disabled={busy || !canRename}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          {canRename ? tr(locale, "rename") : tr(locale, "protectedTag")}
                        </button>
                        {!tag.system && (
                          <button
                            type="button"
                            className={buttonSecondary}
                            onClick={() => void onDelete(tag.name)}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            {tr(locale, "delete")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                </li>
              );
            })}
          </ul>
        )}
      </section>
      {ruleTag && ruleTagData && (
        <TagRuleDrawer
          key={ruleTag}
          tag={ruleTagData}
          locale={locale}
          busy={busy}
          onSave={onSetPattern}
          onClose={() => setRuleTag(null)}
        />
      )}
    </div>
  );
}
