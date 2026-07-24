import { Clock3, SearchX } from "lucide-react";

interface Props {
  filtered?: boolean;
  onClear?: () => void;
}

export function EmptyState({ filtered, onClear }: Props) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 rounded-full border border-[#e6e6e6] bg-white p-4 shadow-sm">
        {filtered ? (
          <SearchX className="h-8 w-8 text-slate-400" />
        ) : (
          <Clock3 className="h-8 w-8 text-slate-400" />
        )}
      </div>
      <p className="text-base font-medium text-slate-700">
        {filtered ? "No matching clipboard items" : "Clipboard history will appear here"}
      </p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        {filtered
          ? "Try a different keyword, tag, or clear the active filters."
          : "Copy text, images, or files and EasyCPTrans will capture them into this floating deck."}
      </p>
      {filtered && onClear && (
        <button
          onClick={onClear}
          className="mt-5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
