import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  Clock3,
  Copy,
  EyeOff,
  Folder,
  Image as ImageIcon,
  Monitor,
  MousePointerClick,
  PenSquare,
  Pin,
  Plus,
  Shield,
  Square,
  Tag,
  Trash2,
} from "lucide-react";
import { formatExactTime, formatTime } from "../lib/time";
import type { HistoryItem } from "../types";
function formatBytes(bytes: number, decimals = 1) {
  if (!+bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const base = 1024;
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(base)));
  return `${parseFloat((bytes / Math.pow(base, index)).toFixed(decimals))} ${units[index]}`;
}

function detectLabel(item: HistoryItem) {
  if (item.contentType === "image") return "Image";
  if (item.contentType === "file") return "File";
  const language = item.metadata?.language?.[0];
  if (language) return language;
  if (/<\/?[a-z][^>]*>/i.test(item.content)) return "HTML";
  if (/\b(function|const|let|class|import|export|return)\b/.test(item.content)) return "Code";
  return "Text";
}

function isCodeLike(item: HistoryItem) {
  return (
    item.contentType === "text" &&
    !!(
      item.metadata?.language?.[0] ||
      /<\/?[a-z][^>]*>/i.test(item.content) ||
      /\b(function|const|let|class|import|export|return|using|namespace|public|private)\b/.test(item.content)
    )
  );
}

function sourceApp(item: HistoryItem) {
  return item.metadata?.sourceApp?.[0] || "EasyCPTrans";
}

function isDeviceTag(item: HistoryItem, tag: string) {
  return item.metadata?.deviceName?.some((name) => name.trim().toLowerCase() === tag.trim().toLowerCase()) ?? false;
}

function isRedundantMetaTag(item: HistoryItem, tag: string) {
  const normalized = tag.trim().toLowerCase();
  if (["text", "image", "file"].includes(normalized)) {
    return normalized === item.contentType;
  }
  if (normalized === "pinned") return item.pinned;
  if (normalized === "private" || normalized === "privacy") return item.isPrivate;
  return false;
}

function translationStatus(item: HistoryItem) {
  return item.metadata?.translationStatus?.[0] || null;
}

function translationQuery(item: HistoryItem) {
  return item.metadata?.wordQuery?.[0] || null;
}

function renderTranslationRichText(content: string) {
  const lines = content.replace(/\\n/g, "\n").split(/\r?\n/);
  const nodes: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <div key={`list-${nodes.length}`} className="eacptrans-translation-list">
        {listItems.map((line, index) => (
          <div key={`${line}-${index}`} className="eacptrans-translation-list-line">{line}</div>
        ))}
      </div>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line === "---") {
      flushList();
      nodes.push(<div key={`divider-${index}`} className="eacptrans-translation-divider" />);
      return;
    }
    if (line.startsWith("# ")) {
      flushList();
      nodes.push(<div key={`title-${index}`} className="eacptrans-translation-title">{line.slice(2)}</div>);
      return;
    }
    if (line.startsWith("## ")) {
      flushList();
      nodes.push(<div key={`section-${index}`} className="eacptrans-translation-section-title">{line.slice(3)}</div>);
      return;
    }
    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      return;
    }
    flushList();
    if (line.startsWith("🏷 ")) {
      nodes.push(
        <div key={`badges-${index}`} className="eacptrans-translation-badges">
          {line.slice(3).split(" · ").map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>,
      );
      return;
    }
    if (line.startsWith("🔊 ")) {
      nodes.push(<div key={`phonetic-${index}`} className="eacptrans-translation-phonetic">{line}</div>);
      return;
    }
    if (line.startsWith("source:") || line.startsWith("query:")) {
      nodes.push(<div key={`source-${index}`} className="eacptrans-translation-source">{line}</div>);
      return;
    }
    nodes.push(<p key={`p-${index}`}>{line}</p>);
  });

  flushList();
  return nodes.length ? nodes : content;
}

interface Props {
  item: HistoryItem;
  availableTags: string[];
  tagColors?: Record<string, string>;
  isSelected?: boolean;
  isCopied: boolean;
  quickSlot?: number | null;
  queueSlot?: number | null;
  onCopy: (item: HistoryItem | { id: number; content: string; contentType: "text" }) => void;
  onPaste: (item: HistoryItem) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
  onToggleTag: (id: number, tag: string) => void;
  onCreateTag?: (id: number, tag: string) => Promise<void>;
  onEnablePrivacy: (id: number) => void;
  onDisablePrivacy: (id: number) => void;
  onQuickEdit: (item: HistoryItem) => void;
  tagMenuOpen?: boolean;
  onTagMenuClose?: () => void;
}

export function ClipboardCard({
  item,
  availableTags,
  tagColors = {},
  isSelected = false,
  isCopied,
  quickSlot = null,
  queueSlot = null,
  onCopy,
  onPaste,
  onTogglePin,
  onDelete,
  onToggleTag,
  onCreateTag,
  onEnablePrivacy,
  onDisablePrivacy,
  onQuickEdit,
  tagMenuOpen = false,
  onTagMenuClose,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [newTagError, setNewTagError] = useState("");
  const [newTagBusy, setNewTagBusy] = useState(false);
  const newTagInputRef = useRef<HTMLInputElement | null>(null);
  const typeLabel = useMemo(() => detectLabel(item), [item]);
  const codeLike = useMemo(() => isCodeLike(item), [item]);
  const typeBadgeClass = codeLike ? "type-code" : `type-${item.contentType}`;
  const hasPrivacy = item.isPrivate;
  const chars = item.metadata?.length?.[0];
  const totalSize = item.metadata?.totalSize?.[0] ?? item.metadata?.size?.[0];
  const width = item.metadata?.width?.[0];
  const height = item.metadata?.height?.[0];
  const translationState = translationStatus(item);
  const translationWord = translationQuery(item);
  const isTranslationItem = item.tags.includes("Word") || Boolean(translationState || translationWord);
  const displayTags = item.tags.filter((tag) => !isRedundantMetaTag(item, tag));
  const tagColorFor = (tag: string) => tagColors[tag.toLowerCase()];
  const tagStyleFor = (tag: string) => {
    const tagColor = tagColorFor(tag);
    return tagColor
      ? {
          borderColor: `${tagColor}55`,
          background: `${tagColor}14`,
          color: tagColor,
        }
      : undefined;
  };
  const typeTagName =
    item.contentType === "text"
      ? "Text"
      : item.contentType === "image"
        ? "Image"
        : item.contentType === "file"
          ? "File"
          : typeLabel;

  useEffect(() => {
    if (tagMenuOpen) {
      setMenuOpen(true);
      setTagPickerOpen(true);
    } else {
      setTagPickerOpen(false);
      setMenuOpen(false);
    }
  }, [tagMenuOpen]);

  useEffect(() => {
    if (creatingTag) newTagInputRef.current?.focus();
  }, [creatingTag]);

  const closeMenus = () => {
    setMenuOpen(false);
    setTagPickerOpen(false);
    setCreatingTag(false);
    setNewTagValue("");
    setNewTagError("");
    onTagMenuClose?.();
  };

  const handleMenuAction = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const handleNewTagSubmit = async () => {
    const value = newTagValue.trim();
    if (!value || newTagBusy || !onCreateTag) return;
    setNewTagBusy(true);
    setNewTagError("");
    try {
      await onCreateTag(item.id, value);
      setNewTagValue("");
      setCreatingTag(false);
    } catch (err) {
      setNewTagError(String(err));
    } finally {
      setNewTagBusy(false);
    }
  };

  const handleNewTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleNewTagSubmit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setCreatingTag(false);
      setNewTagValue("");
      setNewTagError("");
    }
  };

  const stopOuterScroll = (event: WheelEvent<HTMLElement>, axis: "x" | "y") => {
    const node = event.currentTarget;
    const delta = axis === "x" ? (event.deltaY !== 0 ? event.deltaY : event.deltaX) : event.deltaY;
    if (delta === 0) return;

    if (axis === "x") {
      const maxScroll = node.scrollWidth - node.clientWidth;
      if (maxScroll <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      node.scrollLeft = Math.max(0, Math.min(maxScroll, node.scrollLeft + delta));
      return;
    }

    const maxScroll = node.scrollHeight - node.clientHeight;
    if (maxScroll <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = node.scrollTop + delta;
    node.scrollTop = Math.max(0, Math.min(maxScroll, next));
  };

  const renderBody = () => {
    if (item.contentType === "image") {
      return (
        <div
          className="eacptrans-card-body eacptrans-card-body-image"
          onClick={() => onPaste(item)}
          onWheel={(event) => stopOuterScroll(event, "y")}
        >
          {hasPrivacy || !item.content ? (
            <div className="eacptrans-image-placeholder">
              <ImageIcon className="h-8 w-8" />
              <span>Private image</span>
            </div>
          ) : (
            <img src={item.content} alt="Clipboard content" className="eacptrans-image-preview" />
          )}
        </div>
      );
    }

    if (item.contentType === "file") {
      const files = item.content.split("\n").filter(Boolean);
      return (
        <div
          className="eacptrans-card-body"
          onClick={() => onPaste(item)}
          onWheel={(event) => stopOuterScroll(event, "y")}
        >
          <div className="eacptrans-file-stack">
            {files.map((file, index) => (
              <div key={`${item.id}-${index}`} className={`eacptrans-file-row ${hasPrivacy ? "is-private" : ""}`}>
                <div className="eacptrans-file-main">
                  <Folder className="h-4 w-4" />
                  <span>{file}</span>
                </div>
                {item.metadata?.sizes?.[index] && (
                  <span>{formatBytes(parseInt(item.metadata.sizes[index], 10))}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div
        className="eacptrans-card-body"
        onClick={() => onPaste(item)}
        onWheel={(event) => stopOuterScroll(event, "y")}
      >
        <div className={`eacptrans-content-surface ${codeLike ? "is-code" : ""} ${isTranslationItem ? "is-translation" : ""}`}>
          {isTranslationItem ? (
            <div className="eacptrans-translation-card">
              <div className="eacptrans-translation-head">
                <span className="eacptrans-translation-state">
                  {translationState === "pending"
                    ? `Translating ${translationWord || item.content || "..."}`
                    : translationWord || item.content || "Translation"}
                </span>
                <span className="eacptrans-translation-status">
                  {translationState === "pending" ? "Pending" : translationState === "error" ? "Error" : "Ready"}
                </span>
              </div>
              <div className={`eacptrans-translation-body ${hasPrivacy ? "is-private" : ""}`}>
                {translationState === "pending"
                  ? item.content || "Translating..."
                  : renderTranslationRichText(item.content || "Empty translation")}
              </div>
            </div>
          ) : codeLike ? (
            <pre className={`eacptrans-code-content ${hasPrivacy ? "is-private" : ""}`}>{item.content || "Empty text item"}</pre>
          ) : (
            <div className={`eacptrans-text-content ${hasPrivacy ? "is-private" : ""}`}>{item.content || "Empty text item"}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <article
      id={`history-item-${item.id}`}
      className={`eacptrans-card ${isSelected ? "selected" : ""}`}
    >
      <div className="eacptrans-card-head">
        <div className="eacptrans-card-app">
          <span className="eacptrans-card-appicon">
            <Monitor className="h-3.5 w-3.5" />
          </span>
          <span className="eacptrans-card-appname">{sourceApp(item)}</span>
        </div>

        {quickSlot && <span className="eacptrans-card-quick-badge">#{quickSlot}</span>}

        <button
          className={`eacptrans-more-btn ${menuOpen ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) {
              closeMenus();
            } else {
              setMenuOpen(true);
            }
          }}
          title="More actions"
        >
          <ChevronDown className="eacptrans-more-icon h-4 w-4" />
        </button>
      </div>

      {queueSlot && <div className="eacptrans-card-queue-badge">Q{queueSlot}</div>}

      {menuOpen && (
        <>
          {tagPickerOpen && (
            <div
              className="eacptrans-card-menu eacptrans-card-tag-picker"
              onClick={(e) => e.stopPropagation()}
              onWheel={(event) => stopOuterScroll(event, "y")}
            >
              {availableTags.length === 0 && !creatingTag ? (
                <div className="eacptrans-card-menu-empty">No tags available</div>
              ) : (
                availableTags.map((tag) => {
                  const active = item.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      className={`eacptrans-card-tag-option ${active ? "active" : ""}`}
                      onClick={(event) => handleMenuAction(event, () => {
                        onToggleTag(item.id, tag);
                      })}
                    >
                      {active ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                      #{tag}
                    </button>
                  );
                })
              )}
              {creatingTag ? (
                <div className="eacptrans-card-tag-new">
                  <input
                    ref={newTagInputRef}
                    value={newTagValue}
                    onChange={(event) => {
                      setNewTagValue(event.target.value);
                      setNewTagError("");
                    }}
                    onKeyDown={handleNewTagKeyDown}
                    placeholder="New Tag"
                    disabled={newTagBusy}
                  />
                  <button
                    className="eacptrans-card-tag-new-save"
                    onClick={(event) => handleMenuAction(event, () => void handleNewTagSubmit())}
                    disabled={newTagBusy || !newTagValue.trim()}
                  >
                    {newTagBusy ? "..." : "Add"}
                  </button>
                  {newTagError && <span className="eacptrans-card-tag-new-error">{newTagError}</span>}
                </div>
              ) : (
                <button
                  className="eacptrans-card-tag-option eacptrans-card-tag-new-option"
                  onClick={(event) => handleMenuAction(event, () => {
                    setCreatingTag(true);
                    setNewTagError("");
                  })}
                  disabled={!onCreateTag}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Tag
                </button>
              )}
            </div>
          )}

          <div
            className="eacptrans-card-menu"
            onClick={(e) => e.stopPropagation()}
            onWheel={(event) => stopOuterScroll(event, "y")}
          >
            <button
              onClick={(event) => handleMenuAction(event, () => {
                closeMenus();
                onPaste(item);
              })}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              Paste
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                closeMenus();
                onCopy(item);
              })}
            >
              {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                closeMenus();
                onTogglePin(item.id);
              })}
            >
              <Pin className="h-3.5 w-3.5" />
              {item.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                setTagPickerOpen((prev) => {
                  const next = !prev;
                  if (!next) onTagMenuClose?.();
                  return next;
                });
              })}
            >
              <Plus className="h-3.5 w-3.5" />
              Tag
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                closeMenus();
                if (hasPrivacy) onDisablePrivacy(item.id);
                else onEnablePrivacy(item.id);
              })}
            >
              {hasPrivacy ? <Shield className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {hasPrivacy ? "Unlock" : "Private"}
            </button>
            {item.contentType === "text" && !hasPrivacy && (
              <button
                onClick={(event) => handleMenuAction(event, () => {
                  closeMenus();
                  onQuickEdit(item);
                })}
              >
                <PenSquare className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            <button
              className="danger"
              onClick={(event) => handleMenuAction(event, () => {
                closeMenus();
                onDelete(item.id);
              })}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </>
      )}

      {renderBody()}

      <div className="eacptrans-meta-strip" onClick={(e) => e.stopPropagation()} onWheel={(event) => stopOuterScroll(event, "x")}>
        <span className={`eacptrans-meta-item eacptrans-type-badge ${typeBadgeClass}`} style={tagStyleFor(typeTagName)}>{typeLabel}</span>
        <span className="eacptrans-meta-item" title={formatExactTime(item.lastUsedAt)}>
          <Clock3 className="h-3 w-3" />
          {formatTime(item.lastUsedAt)}
        </span>
        {chars && <span className="eacptrans-meta-item">{chars} chars</span>}
        {width && height && <span className="eacptrans-meta-item">{width} x {height}</span>}
        {totalSize && <span className="eacptrans-meta-item">{formatBytes(parseInt(totalSize, 10))}</span>}
        {item.pinned && (
          <span className="eacptrans-meta-item" style={tagStyleFor("Pinned")}>
            <Pin className="h-3 w-3" />
            Pinned
          </span>
        )}
        {hasPrivacy && (
          <span className="eacptrans-meta-item" style={tagStyleFor("Private")}>
            <EyeOff className="h-3 w-3" />
            Private
          </span>
        )}
        {displayTags.map((tag) => {
          return (
            <span
              key={tag}
              className={`eacptrans-tag-chip ${isDeviceTag(item, tag) ? "is-device" : ""}`}
              style={tagStyleFor(tag)}
            >
              <Tag className="h-3 w-3" />#{tag}
            </span>
          );
        })}
      </div>
    </article>
  );
}
