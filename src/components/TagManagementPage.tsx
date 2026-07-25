import { useMemo, useState } from "react";
import { Pencil, Plus, Star, Tag, Trash2 } from "lucide-react";
import { tr, type Locale } from "../lib/i18n";
import type { ManagedTag } from "../types";

interface Props {
  tags: ManagedTag[];
  tagCounts: Map<string, number>;
  busy: boolean;
  onCreate: (tag: string) => Promise<void>;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (tag: string) => Promise<void>;
  onToggleCommon: (tag: string) => Promise<void>;
  onSetColor: (tag: string, color: string) => Promise<void>;
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
  locale,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [message, setMessage] = useState("");
  const [createErrorPulse, setCreateErrorPulse] = useState(false);
  const [renameErrorPulse, setRenameErrorPulse] = useState(false);

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
      setCreateErrorPulse(false);
      window.setTimeout(() => setCreateErrorPulse(true), 0);
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
      setRenameErrorPulse(false);
      window.setTimeout(() => setRenameErrorPulse(true), 0);
    }
  };

  const cancelRename = () => {
    setEditingTag(null);
    setEditingValue("");
    setRenameErrorPulse(false);
    setMessage("");
  };

  const isDeviceTag = (tag: ManagedTag) => tag.id?.startsWith("sys-device-") ?? false;

  return (
    <div className="eacptrans-settings-page">
      <div className="eacptrans-settings-grid">
        <section className="eacptrans-settings-card eacptrans-settings-card-wide">
          <div className="eacptrans-settings-head">
            <h2>
              <Tag className="h-4 w-4" />
              {tr(locale, "tagManagement")}
            </h2>
            <p>{tr(locale, "tagIntro")}</p>
          </div>

          <div className="eacptrans-field">
            <span>{tr(locale, "newTag")}</span>
            <div className="eacptrans-tag-manage-create">
              <input
                className={createErrorPulse ? "eacptrans-tag-input-error" : ""}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setCreateErrorPulse(false);
                  setMessage("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreate();
                }}
                placeholder={tr(locale, "enterTagName")}
                disabled={busy}
                onAnimationEnd={() => setCreateErrorPulse(false)}
              />
              <button className="eacptrans-primary-btn" onClick={() => void handleCreate()} disabled={busy || !draft.trim()}>
                <Plus className="h-4 w-4" />
                {tr(locale, "addTag")}
              </button>
            </div>
          </div>

          {message && <span className="eacptrans-settings-msg">{message}</span>}
        </section>

        <section className="eacptrans-settings-card eacptrans-settings-card-wide">
          <div className="eacptrans-settings-head">
            <h2>
              <Tag className="h-4 w-4" />
              {tr(locale, "existingTags")}
            </h2>
            <p>{tr(locale, "existingTagsDesc")}</p>
          </div>

          <div className="eacptrans-tag-manage-list">
            {sortedTags.length === 0 ? (
              <div className="eacptrans-tag-manage-empty">{tr(locale, "noTags")}</div>
            ) : (
              sortedTags.map((tag) => {
                const count = tagCounts.get(tag.name) ?? 0;
                const editing = editingTag === tag.name;
                const deviceTag = isDeviceTag(tag);
                const canRename = deviceTag || !tag.system;
                return (
                  <div key={tag.name} className="eacptrans-tag-manage-row">
                    <div className="eacptrans-tag-manage-meta">
                      <div className="eacptrans-tag-manage-title">
                        <span className="eacptrans-tag-manage-pill" style={{ background: `${tag.color}18`, color: tag.color }}>
                          #{tag.name}
                        </span>
                        {deviceTag && <span className="eacptrans-tag-kind-badge">{tr(locale, "deviceName")}</span>}
                        {tag.system && !deviceTag && <span className="eacptrans-tag-kind-badge">{tr(locale, "functional")}</span>}
                        {!tag.system && <span className="eacptrans-tag-kind-badge">{tr(locale, "custom")}</span>}
                      </div>
                      <small>
                        {count} {tr(locale, "itemCount")} · {tag.common ? tr(locale, "topBar") : tr(locale, "hidden")}
                      </small>
                    </div>

                    {editing ? (
                      <div className="eacptrans-tag-manage-actions">
                        <input
                          className={renameErrorPulse ? "eacptrans-tag-input-error" : ""}
                          value={editingValue}
                          onChange={(event) => {
                            setEditingValue(event.target.value);
                            setRenameErrorPulse(false);
                            setMessage("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void handleRename();
                            if (event.key === "Escape") cancelRename();
                          }}
                          disabled={busy}
                          onAnimationEnd={() => setRenameErrorPulse(false)}
                        />
                        <button className="eacptrans-primary-btn" onClick={() => void handleRename()} disabled={busy || !editingValue.trim()}>
                          {tr(locale, "save")}
                        </button>
                        <button className="eacptrans-secondary-btn" onClick={cancelRename} disabled={busy}>
                          {tr(locale, "cancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="eacptrans-tag-manage-actions">
                        <button
                          className={`eacptrans-secondary-btn eacptrans-tag-toggle-btn ${tag.common ? "active" : ""}`}
                          onClick={() => void onToggleCommon(tag.name)}
                          disabled={busy}
                          title={tag.common ? tr(locale, "hideFromTopBar") : tr(locale, "showInTopBar")}
                        >
                          <Star className="h-4 w-4" />
                          {tag.common ? tr(locale, "topBar") : tr(locale, "hidden")}
                        </button>
                        <label className="eacptrans-tag-color-picker" title={tr(locale, "color")}>
                          <input
                            type="color"
                            value={tag.color}
                            onChange={(event) => void onSetColor(tag.name, event.target.value)}
                            disabled={busy}
                          />
                          <span>{tag.color}</span>
                        </label>
                        <button
                          className="eacptrans-secondary-btn"
                          onClick={() => {
                            if (!canRename) return;
                            setEditingTag(tag.name);
                            setEditingValue(tag.name);
                            setMessage("");
                          }}
                          disabled={busy || !canRename}
                        >
                          <Pencil className="h-4 w-4" />
                          {canRename ? tr(locale, "rename") : tr(locale, "protectedTag")}
                        </button>
                        {!tag.system && (
                          <button className="eacptrans-secondary-btn" onClick={() => void onDelete(tag.name)} disabled={busy}>
                            <Trash2 className="h-4 w-4" />
                            {tr(locale, "delete")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
