import { useMemo, useState } from "react";
import { Pencil, Plus, Regex, Star, Tag, Trash2 } from "lucide-react";
import { tr, type Locale } from "../lib/i18n";
import type { ManagedTag } from "../types";
import { TagRuleDrawer } from "./TagRuleDrawer";
import {
  buttonPrimary,
  buttonSecondary,
  input,
  surface,
  surfaceInteractive,
} from "./ui";

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
                          #{tag.name}
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
