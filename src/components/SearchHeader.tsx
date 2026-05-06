import { Search, Settings } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSettingsClick?: () => void;
}

export function SearchHeader({ value, onChange, onSettingsClick }: Props) {
  return (
    <header
      className="flex items-center px-4 py-3 bg-white shadow-sm z-10 sticky top-0"
      data-tauri-drag-region
    >
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          className="w-full pl-9 pr-4 py-1.5 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"
          placeholder="Search clipboard..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <button
        className="ml-3 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
        onClick={onSettingsClick}
      >
        <Settings className="w-5 h-5" />
      </button>
    </header>
  );
}
