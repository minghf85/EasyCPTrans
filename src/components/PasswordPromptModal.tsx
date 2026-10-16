import { useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary, input, modalPanel, overlay } from "./ui";

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
    <div className={overlay}>
      <div className={`${modalPanel} w-full max-w-sm p-6`}>
        <h3 className="text-base font-semibold tracking-tight text-gray-900">{title}</h3>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}

        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) onConfirm(password);
          }}
          placeholder="输入隐私密码"
          className={`mt-4 ${input}`}
        />

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className={buttonSecondary}>
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(password)}
            disabled={busy || !password.trim()}
            className={buttonPrimary}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
