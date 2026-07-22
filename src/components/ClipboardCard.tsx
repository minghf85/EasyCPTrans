import { useMemo, useState, type MouseEvent, type WheelEvent } from "react";
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
import { formatTime } from "../lib/time";
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

interface Props {
  item: HistoryItem;
  availableTags: string[];
  isSelected?: boolean;
  isCopied: boolean;
  quickSlot?: number | null;
  queueSlot?: number | null;
  onCopy: (item: HistoryItem | { id: number; content: string; contentType: "text" }) => void;
  onPaste: (item: HistoryItem) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
  onToggleTag: (id: number, tag: string) => void;
  onEnablePrivacy: (id: number) => void;
  onDisablePrivacy: (id: number) => void;
  onQuickEdit: (item: HistoryItem) => void;
}

export function ClipboardCard({
  item,
  availableTags,
  isSelected = false,
  isCopied,
  quickSlot = null,
  queueSlot = null,
  onCopy,
  onPaste,
  onTogglePin,
  onDelete,
  onToggleTag,
  onEnablePrivacy,
  onDisablePrivacy,
  onQuickEdit,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const typeLabel = useMemo(() => detectLabel(item), [item]);
  const codeLike = useMemo(() => isCodeLike(item), [item]);
  const typeBadgeClass = codeLike ? "type-code" : `type-${item.contentType}`;
  const hasPrivacy = item.isPrivate;
  const chars = item.metadata?.length?.[0];
  const totalSize = item.metadata?.totalSize?.[0] ?? item.metadata?.size?.[0];
  const width = item.metadata?.width?.[0];
  const height = item.metadata?.height?.[0];

  const handleMenuAction = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    action();
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
          className="easycp-card-body easycp-card-body-image"
          onClick={() => onPaste(item)}
          onWheel={(event) => stopOuterScroll(event, "y")}
        >
          {hasPrivacy || !item.content ? (
            <div className="easycp-image-placeholder">
              <ImageIcon className="h-8 w-8" />
              <span>Private image</span>
            </div>
          ) : (
            <img src={item.content} alt="Clipboard content" className="easycp-image-preview" />
          )}
        </div>
      );
    }

    if (item.contentType === "file") {
      const files = item.content.split("\n").filter(Boolean);
      return (
        <div
          className="easycp-card-body"
          onClick={() => onPaste(item)}
          onWheel={(event) => stopOuterScroll(event, "y")}
        >
          <div className="easycp-file-stack">
            {files.map((file, index) => (
              <div key={`${item.id}-${index}`} className={`easycp-file-row ${hasPrivacy ? "is-private" : ""}`}>
                <div className="easycp-file-main">
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
        className="easycp-card-body"
        onClick={() => onPaste(item)}
        onWheel={(event) => stopOuterScroll(event, "y")}
      >
        <div className={`easycp-content-surface ${codeLike ? "is-code" : ""}`}>
          {codeLike ? (
            <pre className={`easycp-code-content ${hasPrivacy ? "is-private" : ""}`}>{item.content || "Empty text item"}</pre>
          ) : (
            <div className={`easycp-text-content ${hasPrivacy ? "is-private" : ""}`}>{item.content || "Empty text item"}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <article
      id={`history-item-${item.id}`}
      className={`easycp-card ${isSelected ? "selected" : ""}`}
    >
      <div className="easycp-card-head">
        <div className="easycp-card-app">
          <span className="easycp-card-appicon">
            <Monitor className="h-3.5 w-3.5" />
          </span>
          <span className="easycp-card-appname">{sourceApp(item)}</span>
        </div>

        {quickSlot && <span className="easycp-card-quick-badge">#{quickSlot}</span>}

        <button
          className={`easycp-more-btn ${menuOpen ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          title="More actions"
        >
          <ChevronDown className="easycp-more-icon h-4 w-4" />
        </button>
      </div>

      {queueSlot && <div className="easycp-card-queue-badge">Q{queueSlot}</div>}

      {menuOpen && (
        <>
          {tagPickerOpen && (
            <div
              className="easycp-card-menu easycp-card-tag-picker"
              onClick={(e) => e.stopPropagation()}
              onWheel={(event) => stopOuterScroll(event, "y")}
            >
              {availableTags.length === 0 ? (
                <div className="easycp-card-menu-empty">No tags available</div>
              ) : (
                availableTags.map((tag) => {
                  const active = item.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      className={`easycp-card-tag-option ${active ? "active" : ""}`}
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
            </div>
          )}

          <div
            className="easycp-card-menu"
            onClick={(e) => e.stopPropagation()}
            onWheel={(event) => stopOuterScroll(event, "y")}
          >
            <button
              onClick={(event) => handleMenuAction(event, () => {
                setMenuOpen(false);
                setTagPickerOpen(false);
                onPaste(item);
              })}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              Paste
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                setMenuOpen(false);
                setTagPickerOpen(false);
                onCopy(item);
              })}
            >
              {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                setMenuOpen(false);
                setTagPickerOpen(false);
                onTogglePin(item.id);
              })}
            >
              <Pin className="h-3.5 w-3.5" />
              {item.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                setTagPickerOpen((prev) => !prev);
              })}
            >
              <Plus className="h-3.5 w-3.5" />
              Tag
            </button>
            <button
              onClick={(event) => handleMenuAction(event, () => {
                setMenuOpen(false);
                setTagPickerOpen(false);
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
                  setMenuOpen(false);
                  setTagPickerOpen(false);
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
                setMenuOpen(false);
                setTagPickerOpen(false);
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

      <div className="easycp-meta-strip" onClick={(e) => e.stopPropagation()} onWheel={(event) => stopOuterScroll(event, "x")}>
        <span className={`easycp-meta-item easycp-type-badge ${typeBadgeClass}`}>{typeLabel}</span>
        <span className="easycp-meta-item">
          <Clock3 className="h-3 w-3" />
          {formatTime(item.lastUsedAt)}
        </span>
        {chars && <span className="easycp-meta-item">{chars} chars</span>}
        {width && height && <span className="easycp-meta-item">{width} x {height}</span>}
        {totalSize && <span className="easycp-meta-item">{formatBytes(parseInt(totalSize, 10))}</span>}
        {item.pinned && (
          <span className="easycp-meta-item">
            <Pin className="h-3 w-3" />
            Pinned
          </span>
        )}
        {hasPrivacy && (
          <span className="easycp-meta-item">
            <EyeOff className="h-3 w-3" />
            Private
          </span>
        )}
        {item.tags.map((tag) => (
          <span key={tag} className="easycp-tag-chip">
            <Tag className="h-3 w-3" />#{tag}
          </span>
        ))}
      </div>
    </article>
  );
}
