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
    <div
      className="flex flex-wrap gap-1.5 mb-2"
      onClick={(e) => e.stopPropagation()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100"
        >
          <Tag className="w-2.5 h-2.5" />
          {tag}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(tag);
            }}
            className="hover:text-red-500 ml-0.5"
            title="Remove tag"
          >
            <X className="w-2.5 h-2.5" />
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
          placeholder="tag…"
          className="px-2 py-0.5 text-xs bg-white border border-blue-300 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400 w-20"
        />
      )}
    </div>
  );
}
