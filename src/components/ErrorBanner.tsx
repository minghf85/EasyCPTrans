import { memo } from "react";
import { AlertCircle, X } from "lucide-react";

interface Props {
  message: string | null;
  onDismiss?: () => void;
}

export const ErrorBanner = memo(function ErrorBanner({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div className="eacptrans-banner-in mx-4 mt-3 flex items-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-full p-0.5 transition hover:bg-rose-200/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
