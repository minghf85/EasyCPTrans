import { useMemo, useState } from "react";
import { Pencil, Plus, Star, Tag, Trash2 } from "lucide-react";
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
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [message, setMessage] = useState("");

  const sortedTags = useMemo(
    () =>
      [...tags].sort(
        (a, b) =>
          Number(b.common) - Number(a.common) ||
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
      setMessage("Tag created.");
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
      setMessage("Tag renamed.");
    } catch (err) {
      setMessage(String(err));
    }
  };

  return (
    <div className="easycp-settings-page">
      <div className="easycp-settings-grid">
        <section className="easycp-settings-card easycp-settings-card-wide">
          <div className="easycp-settings-head">
            <h2>
              <Tag className="h-4 w-4" />
              Tag Management
            </h2>
            <p>Create reusable tags for filtering and quick assignment.</p>
          </div>

          <div className="easycp-field">
            <span>New Tag</span>
            <div className="easycp-tag-manage-create">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Enter tag name"
                disabled={busy}
              />
              <button className="easycp-primary-btn" onClick={() => void handleCreate()} disabled={busy || !draft.trim()}>
                <Plus className="h-4 w-4" />
                Add tag
              </button>
            </div>
          </div>

          {message && <span className="easycp-settings-msg">{message}</span>}
        </section>

        <section className="easycp-settings-card easycp-settings-card-wide">
          <div className="easycp-settings-head">
            <h2>
              <Tag className="h-4 w-4" />
              Existing Tags
            </h2>
            <p>Renaming or deleting a tag updates all matching clipboard items.</p>
          </div>

          <div className="easycp-tag-manage-list">
            {sortedTags.length === 0 ? (
              <div className="easycp-tag-manage-empty">No tags yet.</div>
            ) : (
              sortedTags.map((tag) => {
                const count = tagCounts.get(tag.name) ?? 0;
                const editing = editingTag === tag.name;
                return (
                  <div key={tag.name} className="easycp-tag-manage-row">
                    <div className="easycp-tag-manage-meta">
                      <span className="easycp-tag-manage-pill" style={{ background: `${tag.color}18`, color: tag.color }}>
                        #{tag.name}
                      </span>
                      <small>{count} items · {tag.common ? "Common" : "Hidden from tabs"}</small>
                    </div>
                    {editing ? (
                      <div className="easycp-tag-manage-actions">
                        <input
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void handleRename();
                            if (event.key === "Escape") {
                              setEditingTag(null);
                              setEditingValue("");
                            }
                          }}
                          disabled={busy}
                        />
                        <button className="easycp-primary-btn" onClick={() => void handleRename()} disabled={busy || !editingValue.trim()}>
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="easycp-tag-manage-actions">
                        <button className="easycp-secondary-btn" onClick={() => void onToggleCommon(tag.name)} disabled={busy}>
                          <Star className="h-4 w-4" />
                          {tag.common ? "Common" : "Make common"}
                        </button>
                        <label className="easycp-tag-color-picker">
                          <input
                            type="color"
                            value={tag.color}
                            onChange={(event) => void onSetColor(tag.name, event.target.value)}
                            disabled={busy}
                          />
                          <span>{tag.color}</span>
                        </label>
                        <button
                          className="easycp-secondary-btn"
                          onClick={() => {
                            setEditingTag(tag.name);
                            setEditingValue(tag.name);
                          }}
                          disabled={busy}
                        >
                          <Pencil className="h-4 w-4" />
                          Rename
                        </button>
                        {!tag.system && (
                          <button className="easycp-secondary-btn" onClick={() => void onDelete(tag.name)} disabled={busy}>
                            <Trash2 className="h-4 w-4" />
                            Delete
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
