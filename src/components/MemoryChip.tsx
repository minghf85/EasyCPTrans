import { useEffect, useState } from "react";
import { MemoryStick } from "lucide-react";
import { api } from "../lib/api";
import { tr, type Locale } from "../lib/i18n";
import { focusRing } from "./ui";

const POLL_INTERVAL_MS = 5000;

interface ProcessStats {
  workingSetBytes: number;
  privateBytes: number;
  peakWorkingSetBytes: number;
}

function formatMemory(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

interface Props {
  locale: Locale;
  onOpenSettings: () => void;
}

export function MemoryChip({ locale, onOpenSettings }: Props) {
  const [stats, setStats] = useState<ProcessStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void api
        .getProcessStats()
        .then((next) => {
          if (!cancelled) setStats(next);
        })
        .catch(() => {});
    };

    tick();
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!stats) return null;

  const details = [
    `${tr(locale, "memoryWorkingSet")}: ${formatMemory(stats.workingSetBytes)}`,
    `${tr(locale, "memoryPrivate")}: ${formatMemory(stats.privateBytes)}`,
    `${tr(locale, "memoryPeak")}: ${formatMemory(stats.peakWorkingSetBytes)}`,
  ].join("\n");

  return (
    <button
      type="button"
      title={`${tr(locale, "memoryUsage")}\n${details}`}
      onClick={onOpenSettings}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-600 transition duration-200 ease-out hover:bg-gray-50 hover:text-gray-900 active:scale-[0.98] active:translate-y-0 ${focusRing}`}
    >
      <MemoryStick className="h-3.5 w-3.5" aria-hidden />
      <span>{formatMemory(stats.workingSetBytes)}</span>
    </button>
  );
}
