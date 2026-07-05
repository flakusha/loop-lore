/**
 * Log entry formatters — console pretty-print and JSONL serialization.
 */

import type { LogEntry } from "./types";
import { numericToLabel } from "./levels";

// ── Console Pretty Format ──────────────────────────────────

const LEVEL_COLORS: Record<number, string> = {
  10: "\u{1B}[90m", // gray
  20: "\u{1B}[36m", // cyan
  30: "\u{1B}[33m", // yellow
  40: "\u{1B}[31m", // red
};

const RESET = "\u{1B}[0m";

/**
 * Format entry for human-readable console output.
 * Only uses ANSI colors when `color` is true.
 *
 * Output: "[20260704T143000.123+02:00] [INFO]  [module] message"
 */
export function formatConsole(entry: LogEntry, isColor = false): string {
  const levelLabel = numericToLabel(entry.level).padEnd(5);
  const modulePart = entry.module ? ` [${entry.module}]` : "";
  const msg = typeof entry.message === "string" ? entry.message : JSON.stringify(entry.message);

  let line = `[${entry.time}] [${levelLabel}]${modulePart} ${msg}`;

  if (entry.error) {
    line += ` — ${entry.error}`;
  }

  if (isColor) {
    const c = LEVEL_COLORS[entry.level] ?? "";
    return c + line + RESET + "\n";
  }

  return line + "\n";
}

// ── JSONL Serialization ────────────────────────────────────

/**
 * Serialize entry as one JSON line for JSONL output.
 * Strips undefined fields, keeps nulls for schema alignment.
 */
export function formatJSONL(entry: LogEntry): string {
  const obj: Record<string, unknown> = {
    level: entry.level,
    timestamp: entry.timestamp,
    time: entry.time,
    message: typeof entry.message === "string" ? entry.message : JSON.stringify(entry.message),
  };

  if (entry.module) obj.module = entry.module;
  if (entry.requestId) obj.requestId = entry.requestId;
  if (entry.userId) obj.userId = entry.userId;
  if (entry.sessionId) obj.sessionId = entry.sessionId;
  if (entry.error) obj.error = entry.error;
  if (entry.meta && Object.keys(entry.meta).length > 0) obj.meta = entry.meta;

  return JSON.stringify(obj) + "\n";
}
