import { Clock, SearchX } from "lucide-react";

interface Props {
  filtered?: boolean;
  onClear?: () => void;
}

export function EmptyState({ filtered, onClear }: Props) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <SearchX className="w-12 h-12 mb-2 opacity-30" />
        <p className="text-sm">No matches</p>
        {onClear && (
          <button
            onClick={onClear}
            className="mt-2 text-xs text-blue-500 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400">
      <Clock className="w-12 h-12 mb-2 opacity-20" />
      <p className="text-sm">No clipboard history yet</p>
    </div>
  );
}
