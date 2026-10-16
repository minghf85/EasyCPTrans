import { memo } from "react";
import { Clock3, SearchX } from "lucide-react";
import { tr, type Locale } from "../lib/i18n";
import { buttonSecondary, surface } from "./ui";

interface Props {
  locale: Locale;
  filtered?: boolean;
  onClear?: () => void;
}

export const EmptyState = memo(function EmptyState({ locale, filtered, onClear }: Props) {
  const Icon = filtered ? SearchX : Clock3;

  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-8 text-center">
      <div className={`flex h-14 w-14 items-center justify-center ${surface}`}>
        <Icon className="h-6 w-6 text-gray-400" aria-hidden />
      </div>
      <p className="mt-4 text-base font-semibold tracking-tight text-gray-900">
        {filtered ? tr(locale, "noMatchingItems") : tr(locale, "historyWillAppear")}
      </p>
      <p className="mt-1 max-w-md text-sm text-gray-500">
        {filtered ? tr(locale, "emptyFilterHint") : tr(locale, "emptyHistoryHint")}
      </p>
      {filtered && onClear && (
        <button onClick={onClear} className={`mt-6 ${buttonSecondary}`}>
          {tr(locale, "clearFilters")}
        </button>
      )}
    </div>
  );
});
