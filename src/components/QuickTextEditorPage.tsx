import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { buttonPrimary, buttonSecondary, focusRing, surface } from "./ui";

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
    void load();
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
    <div className="flex h-screen w-full flex-col bg-slate-50 text-gray-900">
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">快速编辑文本</h1>
          <p className="truncate text-xs text-gray-500">
            {itemId ? `条目 #${itemId}` : "无效条目"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={backToList} className={buttonSecondary}>
            返回列表
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className={buttonPrimary}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        )}

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={loading || invalidId}
          placeholder={loading ? "加载中…" : "输入文本内容"}
          className={`flex-1 resize-none font-mono text-sm leading-6 ${surface} p-4 ${focusRing} disabled:bg-gray-50`}
        />

        <p className="text-xs text-gray-500">快捷键：Ctrl / Cmd + S 保存</p>
      </main>
    </div>
  );
}
