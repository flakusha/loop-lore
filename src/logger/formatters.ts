// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Log entry formatters — console pretty-print and JSONL serialization.
 */

import { safeJsonStringify, } from "../utils";
import { numericToLabel, } from "./levels";
import type { LogEntry, } from "./types";

// ── Console Pretty Format ──────────────────────────────────

const LEVEL_COLORS: Record<number, string> = {
  5: "\u{1B}[2m", // dim
  10: "\u{1B}[90m", // gray
  20: "\u{1B}[36m", // cyan
  30: "\u{1B}[33m", // yellow
  40: "\u{1B}[31m", // red
  50: "\u{1B}[1;31m", // bold red
};

const RESET = "\u{1B}[0m";

// Strip C0 control chars and collapse embedded newlines so a user-controlled
// message/module/error cannot forge log lines or spoof levels in the console
// sink (JSONL escapes these correctly; only the human-readable console path is
// vulnerable). Tabs are preserved (common in message text); all other C0 chars
// are replaced with a space and CR/LF are collapsed to a single space.
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const NEWLINE_RE = /[\r\n]+/g;

/**
 * @param text
 */
function sanitizeConsoleText(text: string,): string {
  return text.replace(CONTROL_CHAR_RE, " ",).replace(NEWLINE_RE, " ",);
}

/**
 * Format entry for human-readable console output.
 * ANSI mode (default) — uses ANSI escape codes. Output: "[time] [LEVEL] [module] message"
 * CSS mode (browser) — returns formatted string + CSS for console.log `%c`.
 *
 * Output: "[time] [LEVEL] [module] message"
 * @param entry
 * @param isColor
 * @param mode
 */
export function formatConsole(entry: LogEntry, isColor?: boolean, mode?: "ansi",): string;
export function formatConsole(
  entry: LogEntry,
  isColor?: boolean,
  mode?: "css",
): { formatted: string; css: string };
export function formatConsole(
  entry: LogEntry,
  isColor = false,
  mode: "ansi" | "css" = "ansi",
): string | { formatted: string; css: string } {
  const levelLabel = numericToLabel(entry.level,).padEnd(5,);
  const modulePart = entry.module ? ` [${sanitizeConsoleText(entry.module,)}]` : "";
  const msgResult = safeJsonStringify(entry.message,);
  const msg = typeof entry.message === "string" ? entry.message : (msgResult.ok ? msgResult.value : "[unserializable]");

  let line = `[${entry.time}] [${levelLabel}]${modulePart} ${sanitizeConsoleText(msg,)}`;

  if (entry.error) {
    line += ` — ${sanitizeConsoleText(entry.error,)}`;
  }

  if (!isColor) {
    return `${line}\n`;
  }

  if (mode === "css") {
    const css = LEVEL_CSS[entry.level] ?? "";
    return { formatted: `%c${line}\n`, css, };
  }

  // ANSI mode
  const c = LEVEL_COLORS[entry.level] ?? "";
  return `${c + line + RESET}\n`;
}

const LEVEL_CSS: Record<number, string> = {
  5: "color:#666;",
  10: "color:#888;",
  20: "color:#06c;",
  30: "color:#c90;",
  40: "color:#c00;font-weight:bold;",
  50: "color:#900;font-weight:bold;",
};

// ── JSONL Serialization ────────────────────────────────────

/**
 * Serialize entry as one JSON line for JSONL output.
 * Strips undefined fields, keeps nulls for schema alignment.
 * @param entry
 */
export function formatJSONL(entry: LogEntry,): string {
  const msgResult = safeJsonStringify(entry.message,);
  const msg = typeof entry.message === "string" ? entry.message : (msgResult.ok ? msgResult.value : "[unserializable]");
  const obj: Record<string, unknown> = {
    level: entry.level,
    timestamp: entry.timestamp,
    time: entry.time,
    message: msg,
  };

  if (entry.module) { obj.module = entry.module; }
  if (entry.requestId) { obj.requestId = entry.requestId; }
  if (entry.userId) { obj.userId = entry.userId; }
  if (entry.sessionId) { obj.sessionId = entry.sessionId; }
  if (entry.error) { obj.error = entry.error; }
  if (entry.meta && Object.keys(entry.meta,).length > 0) { obj.meta = entry.meta; }

  const r = safeJsonStringify(obj,);
  return `${r.ok ? r.value : "{}"}\n`;
}
