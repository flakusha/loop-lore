/**
 * Date/time formatting utilities.
 *
 * Shared across logger, chat messages, story events, DB timestamps.
 * All functions use system TZ unless overridden via `tz` param or `TZ` env var.
 */

/**
 * Unix epoch milliseconds. Like Date.now() but explicit.
 */
export function unixMs(): number {
  return Date.now();
}

/**
 * Unix epoch seconds — use for JSONL log entries.
 */
export function unixSec(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Timezone offset string e.g. "+02:00", "-05:00", "+00:00".
 *
 * Uses Intl.DateTimeFormat for IANA timezone support.
 * Falls back to getTimezoneOffset arithmetic if Intl fails or no tz given.
 */
export function tzOffset(date?: Date, tz?: string): string {
  const d = date ?? new Date();

  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        timeZoneName: "longOffset",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(d);
      const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value;
      if (offsetPart) {
        // "GMT+02:00" → "+02:00", "GMT-05:00" → "-05:00", "GMT" → "+00:00"
        const normalized = offsetPart.replace("GMT", "");
        return normalized || "+00:00";
      }
    } catch {
      // Intl failed — fall through to getTimezoneOffset
    }
  }

  // Fallback: getTimezoneOffset returns minutes opposite sign
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Format a date as ISO 8601 string with timezone offset.
 *
 * Compact style (default):
 *   "20260704T143000.123+02:00"
 *   — No dashes in date, colon in TZ offset retained for native JS decode
 *   — Denser, sortable, trivially parseable
 *
 * Standard style:
 *   "2026-07-04T14:30:00.123+02:00"
 *   — Full ISO 8601, compatible with browser Date.parse
 */
function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

export function formatTime(options?: {
  date?: Date | number;
  style?: "compact" | "standard";
  tz?: string;
}): string {
  const raw = options?.date ?? new Date();
  const d = raw instanceof Date ? raw : new Date(raw);
  const style = options?.style ?? "compact";
  const offset = tzOffset(d, options?.tz);

  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  const ms = pad(d.getMilliseconds(), 3);

  if (style === "compact") {
    return `${y}${mo}${day}T${h}${mi}${s}.${ms}${offset}`;
  }

  // standard
  return `${y}-${mo}-${day}T${h}:${mi}:${s}.${ms}${offset}`;
}
