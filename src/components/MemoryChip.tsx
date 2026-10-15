import { useEffect, useState } from "react";
import { MemoryStick } from "lucide-react";
import { api } from "../lib/api";
import { tr, type Locale } from "../lib/i18n";

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
      className="eacptrans-memory-chip"
      title={`${tr(locale, "memoryUsage")}\n${details}`}
      onClick={onOpenSettings}
    >
      <MemoryStick className="h-3.5 w-3.5" />
      <span>{formatMemory(stats.workingSetBytes)}</span>
    </button>
  );
}
