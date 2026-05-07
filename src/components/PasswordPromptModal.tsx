import { useEffect, useState } from "react";

interface Props {
  title: string;
  description?: string;
  confirmText: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (password: string) => void;
}

export function PasswordPromptModal({
  title,
  description,
  confirmText,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword("");
  }, [title]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 shadow-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {description && <p className="text-xs text-slate-500">{description}</p>}
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              onConfirm(password);
            }
          }}
          placeholder="输入隐私密码"
          className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(password)}
            disabled={busy || !password.trim()}
            className="px-3 py-1.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? "处理中..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
