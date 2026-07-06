/**
 * Entry size limits — prevent oversized log entries from OOM or pipe kill.
 *
 * Applied at Logger.log() before queue dispatch.
 */

import type { LogEntry, SizeLimits } from "./types";
import { safeJsonStringify } from "../utils";

const DEFAULTS: Required<SizeLimits> = {
  maxMessageBytes: 10_240,
  maxMetaBytes: 102_400,
  maxMetaDepth: 5,
  maxStackBytes: 5120,
  maxMessageKeys: 100,
  maxMetaEntries: 200,
};

function bytes(str: string): number {
  return new TextEncoder().encode(str).length;
}

function truncateString(s: string, maxBytes: number, label = "chars"): string {
  if (bytes(s) <= maxBytes) return s;
  // Binary-search for cut point that fits
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (bytes(s.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  const suffix = `...[truncated ${s.length - lo} ${label}]`;
  return s.slice(0, lo) + suffix;
}

function truncateMeta(
  obj: Record<string, unknown>,
  maxBytes: number,
  maxDepth: number,
  maxEntries: number,
  depth = 0,
): Record<string, unknown> {
  if (depth > maxDepth) return { "[maxDepth]": true };
  const result: Record<string, unknown> = {};
  const keys = Object.keys(obj).slice(0, maxEntries);
  for (const key of keys) {
    const val = obj[key];
    result[key] =
      val !== null && typeof val === "object" && !Array.isArray(val)
        ? truncateMeta(val as Record<string, unknown>, maxBytes, maxDepth, maxEntries, depth + 1)
        : val;
  }
  if (Object.keys(obj).length > maxEntries) {
    result["[truncated]"] = `${Object.keys(obj).length - maxEntries} excess keys`;
  }
  // Check total serialized size — drop entries if still too big
  const serializedResult = safeJsonStringify(result);
  const serialized = serializedResult.ok ? serializedResult.value : "{}";
  if (bytes(serialized) <= maxBytes) return result;
  // Remove deepest keys one by one until under limit
  const out: Record<string, unknown> = {};
  let size = 2; // {}
  for (const key of keys) {
    const val = result[key];
    const keyStr = safeJsonStringify(key);
    const valStr = safeJsonStringify(val);
    const pair = (keyStr.ok ? keyStr.value : "null") + ":" + (valStr.ok ? valStr.value : "null");
    if (size + bytes(pair) + 1 > maxBytes) {
      out["[truncated]"] = `meta exceeds ${maxBytes} bytes`;
      break;
    }
    out[key] = val;
    size += bytes(pair) + 1; // +1 for comma
  }
  return out;
}

/**
 * Apply size limits to a log entry. Returns new entry, does not mutate.
 */
export function applyLimits(entry: LogEntry, overrides?: Partial<SizeLimits>): LogEntry {
  const limits: Required<SizeLimits> = { ...DEFAULTS, ...overrides };
  const result: LogEntry = { ...entry };

  // Truncate message string
  if (typeof result.message === "string") {
    result.message = truncateString(result.message, limits.maxMessageBytes);
  } else if (typeof result.message === "object") {
    const keys = Object.keys(result.message);
    if (keys.length > limits.maxMessageKeys) {
      const truncated: Record<string, unknown> = {};
      for (const k of keys.slice(0, limits.maxMessageKeys)) {
        truncated[k] = result.message[k];
      }
      truncated["[truncated]"] = `${keys.length - limits.maxMessageKeys} excess keys`;
      result.message = truncated;
    }
  }

  // Truncate error stack
  if (result.error) {
    result.error = truncateString(result.error, limits.maxStackBytes);
  }

  // Truncate meta
  if (result.meta) {
    result.meta = truncateMeta(result.meta, limits.maxMetaBytes, limits.maxMetaDepth, limits.maxMetaEntries);
  }

  return result;
}

export { DEFAULTS };
