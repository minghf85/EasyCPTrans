import { useEffect, useState } from "react";
import { Sparkles, Terminal, Copy } from "lucide-react";
import { api } from "../lib/api";
import { tr, type Locale } from "../lib/i18n";
import type { HistoryItem } from "../types";

interface Props {
  locale: Locale;
  enabled: boolean;
  history: HistoryItem[];
  tagColors: Record<string, string>;
  onCopy: (item: HistoryItem) => void;
  onPaste: (item: HistoryItem) => void;
}

function formatPreview(item: HistoryItem) {
  if (item.contentType === "text") {
    return item.content.slice(0, 80) || "Text";
  }
  if (item.contentType === "image") {
    return "Image";
  }
  if (item.contentType === "file") {
    const files = item.content.split("\n").filter(Boolean);
    return files[0] || "File";
  }
  return item.content.slice(0, 80);
}

function tagStyleFor(tag: string, tagColors: Record<string, string>) {
  const color = tagColors[tag.toLowerCase()];
  return color
    ? {
        borderColor: `${color}55`,
        background: `${color}14`,
        color,
      }
    : undefined;
}

export function RecommendationBar({
  locale,
  enabled,
  history,
  tagColors,
  onCopy,
  onPaste,
}: Props) {
  const [recommendations, setRecommendations] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRecommendations([]);
      return;
    }

    let cancelled = false;
    setBusy(true);
    api
      .getRecommendations({ limit: 6 })
      .then((items) => {
        if (cancelled) return;
        setRecommendations(items);
      })
      .catch((err) => {
        console.error("Recommendations failed:", err);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, history.length]);

  if (!enabled || recommendations.length === 0) return null;

  return (
    <div className="eacptrans-recommend-bar">
      <div className="eacptrans-recommend-head">
        <Sparkles className="h-3.5 w-3.5" />
        <span>{tr(locale, "recommendedForYou")}</span>
      </div>
      <div className="eacptrans-recommend-list">
        {recommendations.map((item) => (
          <button
            key={item.id}
            className="eacptrans-recommend-item"
            onClick={() => onPaste(item)}
            title={item.content.slice(0, 200)}
          >
            <span className="eacptrans-recommend-text">{formatPreview(item)}</span>
            <span className="eacptrans-recommend-meta">
              {item.contentType === "text" && item.metadata?.commands && item.metadata.commands.length > 0 && (
                <span className="eacptrans-recommend-badge" style={tagStyleFor("Command", tagColors)}>
                  <Terminal className="h-3 w-3" />
                  {tr(locale, "commandTag")}
                </span>
              )}
              {item.pinned && (
                <span className="eacptrans-recommend-badge" style={tagStyleFor("Pinned", tagColors)}>
                  {tr(locale, "pinned")}
                </span>
              )}
              <span
                className="eacptrans-recommend-copy"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(item);
                }}
                title="Copy"
              >
                <Copy className="h-3 w-3" />
              </span>
            </span>
          </button>
        ))}
      </div>
      {busy && <div className="eacptrans-recommend-shimmer" />}
    </div>
  );
}
