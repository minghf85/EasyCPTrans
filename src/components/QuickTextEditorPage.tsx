import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

interface Props {
  itemId: number | null;
}

export function QuickTextEditorPage({ itemId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");

  const invalidId = itemId === null;

  useEffect(() => {
    if (invalidId) {
      setLoading(false);
      setError("参数错误，缺少有效的文本条目 ID。");
      return;
    }
    let disposed = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const item = await api.getTextItem(itemId);
        if (disposed) return;
        setContent(item.content);
        setOriginal(item.content);
      } catch (err) {
        if (disposed) return;
        setError("加载文本失败: " + String(err));
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    load();
    return () => {
      disposed = true;
    };
  }, [itemId, invalidId]);

  const backToList = () => {
    window.location.hash = "";
  };

  const canSave = useMemo(() => {
    if (invalidId || loading || saving) return false;
    const normalized = content.trim();
    return normalized.length > 0 && normalized !== original;
  }, [content, invalidId, loading, original, saving]);

  const handleSave = useCallback(async () => {
    if (!canSave || itemId === null) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateTextItem(itemId, content);
      const normalized = content.trim();
      setOriginal(normalized);
      setContent(normalized);
      setMessage("保存成功");
    } catch (err) {
      setError("保存失败: " + String(err));
    } finally {
      setSaving(false);
    }
  }, [canSave, content, itemId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-800 flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-sm font-semibold">快速编辑文本</h1>
          <span className="text-xs text-slate-500">{itemId ? `条目 #${itemId}` : "无效条目"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={backToList}
            className="px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-xs"
          >
            返回列表
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-3">
        {error && (
          <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-red-600 text-xs">{error}</div>
        )}
        {message && (
          <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-green-700 text-xs">{message}</div>
        )}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading || invalidId}
          placeholder={loading ? "加载中..." : "输入文本内容"}
          className="flex-1 resize-none w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100"
        />
        <div className="text-xs text-slate-500">快捷键: Ctrl/Cmd + S 保存</div>
      </main>
    </div>
  );
}
