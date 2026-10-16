import { memo } from "react";
import { AlertCircle, X } from "lucide-react";
import { focusRing } from "./ui";

interface Props {
  message: string | null;
  onDismiss?: () => void;
}

export const ErrorBanner = memo(function ErrorBanner({ message, onDismiss }: Props) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="eacp-animate-slide mx-4 mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`inline-flex shrink-0 items-center justify-center rounded-lg p-1 transition-all duration-200 ease-out hover:bg-red-100 active:scale-[0.98] ${focusRing}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
});
