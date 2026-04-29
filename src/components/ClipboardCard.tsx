import { Check, Clock, Copy, Link, Mail, Phone, Pin, Plus, Trash2, Monitor } from "lucide-react";
import { formatTime } from "../lib/time";
import type { HistoryItem } from "../types";
import { TagsRow } from "./TagsRow";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i >= 2 && bytes > 100 * 1024 * 1024) {
    return "> 100 MB";
  }
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface ExtractedInfo {
  type: "url" | "email" | "phone" | "ip" | "domain";
  value: string;
}

function extractInfo(text: string): ExtractedInfo[] {
  const extracted: ExtractedInfo[] = [];
  const add = (type: ExtractedInfo["type"], value: string) => {
    if (!extracted.find((e) => e.type === type && e.value === value)) {
      extracted.push({ type, value });
    }
  };

  // 更严格的域名匹配模式
  const strictPatterns = {
    // 通用顶级域名
    generic: 'com|org|net|edu|gov|mil|int',
    // 赞助顶级域名
    sponsored: 'aero|asia|cat|coop|jobs|mobi|museum|post|pro|tel|travel|xxx',
    // 基础设施顶级域名
    infrastructure: 'arpa',
    // 热门新顶级域名
    newTLDs: 'top|xyz|site|online|shop|store|tech|space|app|dev|io|ai|me|tv|co|info|biz|club|work|design|art|blog|news|cloud|digital',
    // 主要国别域名
    country: 'cn|us|uk|jp|kr|ru|de|fr|it|es|au|ca|br|in|mx|nl|se|ch|tw|hk|mo|sg|my|th|vn|ph|id|tr'
  };

  const allTLDs = Object.values(strictPatterns).join('|');
  
  // 精确的URL匹配
  const strictUrlRegex = new RegExp(
    `\\b(?:https?://)?` +
    `(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+` +
    `(?:${allTLDs})` +
    `(?::\\d{2,5})?` +
    `(?:/[^\\s?#]*[^\\s?#.,;:!?)])?`,
    'gi'
  );

  const urls = text.match(strictUrlRegex);
  if (urls) {
    urls.forEach((u) => {
      const fullUrl = u.startsWith('http') ? u : `https://${u}`;
      add("url", fullUrl);
    });
  }

  // 精确的邮箱匹配
  const strictEmailRegex = new RegExp(
    `\\b[a-zA-Z0-9][a-zA-Z0-9._%+-]{0,63}@` +
    `(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+` +
    `(?:${allTLDs})\\b`,
    'gi'
  );

  const emails = text.match(strictEmailRegex);
  if (emails) emails.forEach((e) => add("email", e));

  // 严格的手机号匹配
  const strictPhoneRegex = /(?:(?:\+|00)86\s*)?1(?:3\d{3}|5[^4\D]\d{2}|8\d{3}|7(?:[0-35-9]\d{2}|4[0-9]\d|41[0-9])|9[189]\d{2}|6[567]\d{2}|4[^0\D]\d{2})\d{6}/g;
  const phones = text.match(strictPhoneRegex);
  if (phones) phones.forEach((p) => add("phone", p));

  // 严格的IP地址
  const strictIPRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\b/g;
  const ips = text.match(strictIPRegex);
  if (ips) ips.forEach((ip) => add("ip", ip));

  // 精确的域名匹配
  const strictDomainRegex = new RegExp(
    `\\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+` +
    `(?:${allTLDs})\\b`,
    'gi'
  );

  const domains = text.match(strictDomainRegex);
  if (domains) domains.forEach((d) => add("domain", d));

  return extracted;
}

interface Props {
  item: HistoryItem;
  isCopied: boolean;
  isTagging: boolean;
  tagInput: string;
  showExtracts?: boolean;
  onCopy: (item: HistoryItem | { id: number; content: string; contentType: "text" }) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
  onAddTag: (id: number, tag: string) => void;
  onRemoveTag: (id: number, tag: string) => void;
  onStartTag: (id: number) => void;
  onStopTag: () => void;
  onTagInputChange: (v: string) => void;
  onIngestExtract?: (content: string) => void;
}

export function ClipboardCard({
  item,
  isCopied,
  isTagging,
  tagInput,
  showExtracts,
  onCopy,
  onTogglePin,
  onDelete,
  onAddTag,
  onRemoveTag,
  onStartTag,
  onStopTag,
  onTagInputChange,
  onIngestExtract,
}: Props) {
  const commitTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed) onAddTag(item.id, trimmed);
    onStopTag();
  };

  return (
    <div
      className="group flex flex-col bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-blue-300 active:scale-[0.99] transition-all cursor-pointer relative"
      onClick={() => onCopy(item)}
    >
      {/* 内容 */}
      <div className="text-sm font-medium text-slate-700 line-clamp-3 mb-2">
        {item.contentType === "text" && (
          item.content
        )}
        {item.contentType === "image" && (
          <div className="flex justify-center bg-slate-100 rounded-md p-1">
            <img
              src={item.content}
              alt="Clipboard content"
              className="max-h-32 max-w-full object-contain shadow-sm"
            />
          </div>
        )}
        {item.contentType === "file" && (
          <div className="flex flex-col space-y-1 text-sm bg-slate-50 p-2 rounded border border-slate-100">
            {item.content.split("\n").map((line, idx) => (
              <div key={idx} className="flex flex-row items-center text-slate-600 truncate">
                <span className="truncate flex-1">{line}</span>
                {item.metadata?.sizes && item.metadata.sizes[idx] && (
                  <span className="ml-2 text-xs text-slate-400 shrink-0">
                    {formatBytes(parseInt(item.metadata.sizes[idx], 10))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showExtracts && item.contentType === "text" && (
        <div className="flex flex-wrap gap-2 mb-2">
          {extractInfo(item.content).map((extract, idx) => (
            <div
              key={idx}
              className="flex items-center text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors group/extract"
              onClick={(e) => {
                e.stopPropagation();
                onCopy({ id: 0, content: extract.value, contentType: "text" });
              }}
              title="Click to paste directly"
            >
              {extract.type === "url" && <Link className="w-3 h-3 mr-1" />}
              {extract.type === "email" && <Mail className="w-3 h-3 mr-1" />}
              {extract.type === "phone" && <Phone className="w-3 h-3 mr-1" />}
              <span className="truncate max-w-[150px]">{extract.value}</span>
              <button
                className="ml-2 opacity-0 group-hover/extract:opacity-100 text-slate-400 hover:text-blue-500 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onIngestExtract?.(extract.value);
                }}
                title="Save as new clipboard item"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <TagsRow
        tags={item.tags}
        isEditing={isTagging}
        inputValue={tagInput}
        onInputChange={onTagInputChange}
        onCommit={commitTag}
        onCancel={onStopTag}
        onRemove={(tag) => onRemoveTag(item.id, tag)}
      />

      {/* 底部信息 + 操作 */}
      <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
        <div className="flex items-center space-x-1">
          <Clock className="w-3 h-3" />
          <span title={item.lastUsedAt ?? ""}>{formatTime(item.lastUsedAt)}</span>
            {item.useCount > 1 && (
            <span className="ml-1 text-slate-400">·×{item.useCount}</span>
          )}
          {item.metadata?.length && (
            <span className="ml-1 text-slate-400">· {item.metadata.length[0]} chars</span>
          )}
          {item.metadata?.width && item.metadata?.height && (
            <span className="ml-1 text-slate-400">· {item.metadata.width[0]}x{item.metadata.height[0]}</span>
          )}
          {item.metadata?.size && (
            <span className="ml-1 text-slate-400">· {formatBytes(parseInt(item.metadata.size[0], 10))}</span>
          )}
          {item.metadata?.totalSize && (
            <span className="ml-1 text-slate-400">· {formatBytes(parseInt(item.metadata.totalSize[0], 10))}</span>
          )}
          {item.metadata?.sourceApp && item.metadata.sourceApp[0] && (
            <span className="ml-1 text-slate-400 truncate max-w-[120px] inline-block align-bottom" title={`来源: ${item.metadata.sourceApp[0]}`}>
              · <Monitor className="w-3 h-3 inline-block -mt-1 mx-0.5" />{item.metadata.sourceApp[0]}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isTagging) onStopTag();
              else onStartTag(item.id);
            }}
            className={`p-1.5 rounded hover:bg-slate-100 ${
              isTagging ? "text-blue-500" : "text-slate-400 hover:text-blue-500"
            }`}
            title="Add tag"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(item.id);
            }}
            className={`p-1.5 rounded hover:bg-slate-100 ${
              item.pinned ? "text-blue-500" : "text-slate-400"
            }`}
            title="Pin"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy(item);
            }}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-500"
            title="Copy"
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {item.pinned && (
        <Pin className="absolute top-2 right-2 w-3 h-3 text-blue-500 transform rotate-45" />
      )}
    </div>
  );
}
