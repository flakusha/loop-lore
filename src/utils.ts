/**
 * Shared Utilities
 *
 * Common helpers used across modules — uid generation,
 * error formatting, and other general-purpose functions.
 */
import { randomUUID } from "node:crypto";

// ── ID Generation ─────────────────────────────────────────────

/** Create a DB-safe UUID string */
export const uid = (): string => randomUUID();

// ── Error Helpers ─────────────────────────────────────────────

/** Extract a safe Error object from an unknown thrown value */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Extract error message string from an unknown thrown value */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

// ── Safe JSON Operations ─────────────────────────────────────

/** Result of a safe JSON parse or stringify operation */
export type JsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

/**
 * Parse JSON safely. Never throws — returns a discriminated union.
 *
 * @example
 * const result = safeJsonParse<UserConfig>(raw);
 * if (result.ok) use(result.value);
 * else log(result.error);
 */
export function safeJsonParse<T = unknown>(text: string): JsonResult<T> {
  try {
    const value = JSON.parse(text) as T;
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: asError(error) };
  }
}

/**
 * Stringify JSON safely. Never throws — returns a discriminated union.
 * Handles edge cases like circular references gracefully.
 *
 * @example
 * const result = safeJsonStringify(data);
 * if (!result.ok) { handleError(result.error); }
 */
export function safeJsonStringify(
  value: unknown,
  space?: number,
): JsonResult<string> {
  try {
    return { ok: true, value: JSON.stringify(value, null, space) };
  } catch (error) {
    return { ok: false, error: asError(error) };
  }
}

/**
 * Parse JSON, returning the value or `fallback` on failure.
 * Convenience wrapper for cases where null/nil is acceptable on error.
 *
 * @example const data = jsonParseOr(raw, defaultConfig);
 */
export function jsonParseOr<T>(text: string, fallback: T): T {
  const result = safeJsonParse<T>(text);
  return result.ok ? result.value : fallback;
}
