import { AlertCircle } from "lucide-react";

interface Props {
  message: string | null;
}

export function ErrorBanner({ message }: Props) {
  if (!message) return null;
  return (
    <div className="mx-4 mt-3 flex items-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="truncate">{message}</span>
    </div>
  );
}
