import { Search, Settings, GripHorizontal, Pin, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSettingsClick?: () => void;
  alwaysOnTop?: boolean;
  onToggleAlwaysOnTop?: () => void;
}

export function SearchHeader({
  value,
  onChange,
  onSettingsClick,
  alwaysOnTop = false,
  onToggleAlwaysOnTop,
}: Props) {
  const handleStartDrag = async (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error("start dragging failed", error);
    }
  };

  const handleMinimizeToTray = async () => {
    try {
      await getCurrentWindow().hide();
    } catch (error) {
      console.error("hide window failed", error);
    }
  };

  return (
    <header className="flex items-center gap-3 px-3 py-2 bg-white/95 shadow-sm z-20 sticky top-0 backdrop-blur">
      <div
        className="h-8 w-8 shrink-0 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing"
        title="Drag window"
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
      >
        <GripHorizontal className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <button
        type="button"
        className={`h-8 w-8 shrink-0 rounded-md transition-colors flex items-center justify-center ${
          alwaysOnTop
            ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
            : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        }`}
        title={alwaysOnTop ? "Unpin window" : "Pin window on top"}
        aria-label={alwaysOnTop ? "Unpin window" : "Pin window on top"}
        onClick={onToggleAlwaysOnTop}
      >
        <Pin className="w-4 h-4" strokeWidth={1.75} />
      </button>
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
        <Settings className="w-5 h-5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
        aria-label="Minimize to tray"
        onClick={handleMinimizeToTray}
      >
        <X className="w-5 h-5" strokeWidth={1.75} />
      </button>
    </header>
  );
}
