// SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC without a TZ marker.
// Force UTC parsing then render in local time.
export const formatTime = (ts: string | null): string => {
  if (!ts) return "";
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString();
};
