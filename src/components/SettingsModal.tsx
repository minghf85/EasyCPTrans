import { useState, useEffect } from "react";
import { X, Folder } from "lucide-react";
import { api } from "../lib/api";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [cachePath, setCachePath] = useState("");
  const [shortcut, setShortcut] = useState("CommandOrControl+Shift+E");
  const [defaultDir, setDefaultDir] = useState("");
  const [effectiveDir, setEffectiveDir] = useState("");
  const [autoPaste, setAutoPaste] = useState(true);
  const [keepWindowOpen, setKeepWindowOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    // 获取配置
    api.getConfig().then(cfg => {
        if (cfg) {
            setCachePath(cfg.cachePath || "");
            setShortcut(cfg.shortcut || "CommandOrControl+Shift+E");
            setDefaultDir(cfg.defaultDir || "");
            setEffectiveDir(cfg.effectiveDir || "");
            if (typeof cfg.autoPaste === 'boolean') setAutoPaste(cfg.autoPaste);
            if (typeof cfg.keepWindowOpen === 'boolean') setKeepWindowOpen(cfg.keepWindowOpen);
            if (typeof cfg.pageSize === 'number') setPageSize(cfg.pageSize);
        }
    }).catch(e => console.error(e));
  }, []);

  const handleSave = async () => {
    try {
        await api.setConfig({ cachePath, shortcut, autoPaste, keepWindowOpen, pageSize });
        await relaunch();
    } catch (e) {
        console.error("Save config error:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-0">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[90vw] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">设置 (Settings)</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </header>
        
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-sm">
          <div className="space-y-1.5">
            <label className="block text-slate-700 font-medium">缓存与数据路径</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={cachePath}
                onChange={e => setCachePath(e.target.value)}
                placeholder="默认使用系统应用数据目录"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button 
                className="px-3 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-md hover:bg-slate-200"
                onClick={async () => {
                   try {
                     const selected = await open({
                       directory: true,
                       multiple: false
                     });
                     if (selected && typeof selected === 'string') {
                       setCachePath(selected);
                     }
                   } catch (err) {
                     console.error("Open dialog error:", err);
                   }
                }}
              >
                <Folder className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">此路径用于存储剪贴板数据库（clipboard.db）及图像等媒体缓存文件。</p>
            {effectiveDir && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700 break-all">
                <span className="font-semibold block mb-1">当前生效存储路径：</span>
                {effectiveDir}
              </div>
            )}
            {defaultDir && !cachePath && (
              <div className="text-xs text-slate-400 mt-1 break-all">
                默认路径：{defaultDir}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-700 font-medium">全局快捷键</label>
            <input 
              type="text" 
              value={shortcut}
              onChange={e => setShortcut(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-slate-700 font-medium border-b border-slate-100 pb-1">交互行为</label>
            
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={autoPaste}
                  onChange={e => setAutoPaste(e.target.checked)}
                  className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
              </div>
              <div>
                <span className="block text-slate-700 group-hover:text-blue-600 transition-colors">在此应用内选择历史记录后自动粘贴</span>
                <span className="block text-xs text-slate-400">选择条目后自动模拟 Ctrl+V / Cmd+V 追加到上一窗口</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={keepWindowOpen}
                  onChange={e => setKeepWindowOpen(e.target.checked)}
                  className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
              </div>
              <div>
                <span className="block text-slate-700 group-hover:text-blue-600 transition-colors">选择后保持主窗口打开</span>
                <span className="block text-xs text-slate-400">开启后点击条目不会自动隐藏主窗口</span>
              </div>
            </label>

            <div className="space-y-1.5 pt-2">
              <label className="block text-slate-700 font-medium">每页显示数量 (分页大小)</label>
              <input 
                type="number" 
                min="10"
                max="500"
                value={pageSize}
                onChange={e => setPageSize(parseInt(e.target.value) || 50)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-slate-400">限制列表单页显示的最大条目数，建议保持 50-100 以保证稳定流畅的渲染性能。</p>
            </div>
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors bg-slate-100"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 transition-colors shadow-sm"
          >
            保存并重启
          </button>
        </footer>
      </div>
    </div>
  );
}