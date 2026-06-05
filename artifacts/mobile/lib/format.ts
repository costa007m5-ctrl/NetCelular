/** Format a runtime in minutes to a human-readable string */
export function formatRuntime(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Format a date string (YYYY-MM-DD) to a localized Brazilian date */
export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

/** Format a year from a date string */
export function extractYear(dateStr?: string | null): string {
  if (!dateStr) return "";
  return dateStr.split("-")[0] ?? "";
}

/** Format a number with thousands separator */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Format a file size in bytes */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Format duration in seconds to hh:mm:ss or mm:ss */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Truncate a string to a maximum length */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

/** Capitalize first letter */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Format a rating value */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/** Format vote count */
export function formatVotes(votes: number): string {
  return `${formatNumber(votes)} votos`;
}
