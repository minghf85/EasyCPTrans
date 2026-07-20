import { Tag, X } from "lucide-react";

interface Props {
  tags: string[];
  isEditing: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onRemove: (tag: string) => void;
}

export function TagsRow({
  tags,
  isEditing,
  inputValue,
  onInputChange,
  onCommit,
  onCancel,
  onRemove,
}: Props) {
  if (tags.length === 0 && !isEditing) return null;

  return (
    <div className="mb-2 flex flex-nowrap gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
        >
          <Tag className="h-3 w-3 text-slate-400" />
          {tag}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(tag);
            }}
            className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {isEditing && (
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit();
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
          onBlur={onCommit}
          placeholder="tag"
          className="w-24 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-xs outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-200/60"
        />
      )}
    </div>
  );
}
