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
  return Math.floor(Date.now() / 1000,);
}

/**
 * Timezone offset string e.g. "+02:00", "-05:00", "+00:00".
 *
 * Uses Intl.DateTimeFormat for IANA timezone support.
 * Falls back to getTimezoneOffset arithmetic if Intl fails or no tz given.
 * Honors Node.js `TZ` environment variable by default.
 */
export function tzOffset(date?: Date, tz?: string,): string {
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
      },).formatToParts(d,);
      const offsetPart = parts.find((p,) => p.type === "timeZoneName")?.value;
      if (offsetPart) {
        // "GMT+02:00" → "+02:00", "GMT-05:00" → "-05:00", "GMT" → "+00:00"
        const normalized = offsetPart.replace("GMT", "",);
        return normalized || "+00:00";
      }
    } catch {
      // Intl failed — fall through to getTimezoneOffset
    }
  }

  // Fallback: getTimezoneOffset returns minutes opposite sign
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin,);
  return `${sign}${String(Math.floor(abs / 60,),).padStart(2, "0",)}:${String(abs % 60,).padStart(2, "0",)}`;
}

function pad(n: number, len = 2,): string {
  return String(n,).padStart(len, "0",);
}

/**
 * Format a date as ISO 8601 string with timezone offset.
 *
 * Standard style (default):
 *   "2026-07-04T14:30:00.123+02:00"
 *   — Full ISO 8601, compatible with browser Date.parse
 *   — Default for parseability across frontend/backend
 *   — NOTE: changed from "compact" to "standard" as default. Callers relying
 *     on compact output must pass `style: "compact"` explicitly.
 *
 * Compact style (opt-in):
 *   "20260704T143000.123+02:00"
 *   — No dashes in date, colon in TZ offset retained for native JS decode
 *   — Denser, sortable
 *   — NOT parseable by Date.parse() — use only for display/compact logs
 *
 * @param options.style - "standard" (default) or "compact"
 * @param options.tz - IANA timezone name (e.g., "Europe/Berlin") or offset string
 * @param options.date - Date object, timestamp, or undefined for now
 */
export function formatTime(options?: {
  date?: Date | number;
  style?: "compact" | "standard";
  tz?: string;
},): string {
  const raw = options?.date ?? new Date();
  const d = raw instanceof Date ? raw : new Date(raw,);
  const style = options?.style ?? "standard"; // Default to standard for parseability
  const tz = options?.tz;

  // Compute time components in target timezone to match offset
  let y: number, mo: number, day: number, h: number, mi: number, s: number, ms: number;
  let offset: string;

  if (tz) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      timeZoneName: "longOffset",
    },);
    const parts = fmt.formatToParts(d,);
    const get = (type: string,): number => Number(parts.find((p,) => p.type === type)?.value ?? 0,);

    y = get("year",);
    mo = get("month",);
    day = get("day",);
    h = get("hour",);
    mi = get("minute",);
    s = get("second",);
    ms = get("fractionalSecond",);
    const offsetRaw = parts.find((p,) => p.type === "timeZoneName")?.value ?? "GMT";
    offset = (offsetRaw.startsWith("GMT",) ? offsetRaw.slice(3,) : offsetRaw) || "+00:00";
    if (!offset.includes(":",)) {
      // Handle "+0200" → "+02:00"
      offset = `${offset.slice(0, 3,)}:${offset.slice(3,)}`;
    }
  } else {
    y = d.getFullYear();
    mo = d.getMonth() + 1;
    day = d.getDate();
    h = d.getHours();
    mi = d.getMinutes();
    s = d.getSeconds();
    ms = d.getMilliseconds();
    offset = tzOffset(d,);
  }

  if (style === "compact") {
    // Compact: "20260704T143000.123+02:00" — denser, sortable, NOT parseable by Date
    return `${y}${pad(mo,)}${pad(day,)}T${pad(h,)}${pad(mi,)}${pad(s,)}.${pad(ms, 3,)}${offset}`;
  }

  // standard: "2026-07-04T14:30:00.123+02:00" — full ISO 8601, parseable by Date.parse()
  return `${y}-${pad(mo,)}-${pad(day,)}T${pad(h,)}:${pad(mi,)}:${pad(s,)}.${pad(ms, 3,)}${offset}`;
}
