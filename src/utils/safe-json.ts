// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe JSON operations — no Node.js dependencies.
 *
 * Pure JS functions for safe parse/stringify that work in browser + server.
 */

// ── Result Type ──────────────────────────────────────────────

/** Result of a safe JSON parse or stringify operation */
export type JsonResult<T,> = { ok: true; value: T } | { ok: false; error: Error };

// ── Error Helper ─────────────────────────────────────────────

/**
 * Extract a safe Error object from an unknown thrown value
 * @param error - any thrown value
 * @returns Error instance (coerced via `new Error(String(...))` when not already an Error).
 */
function asError(error: unknown,): Error {
  return error instanceof Error ? error : new Error(String(error,),);
}

// ── Parse ────────────────────────────────────────────────────

/**
 * Parse JSON safely. Never throws — returns a discriminated union.
 * @param text - JSON string to parse
 * @returns `{ ok: true, value: T }` on success, `{ ok: false, error }` on parse failure.
 */
export function safeJsonParse<T = unknown,>(text: string,): JsonResult<T> {
  try {
    const value = JSON.parse(text,) as T;
    return { ok: true, value, };
  } catch (error) {
    return { ok: false, error: asError(error,), };
  }
}

/**
 * Parse JSON, returning the value or `fallback` on failure.
 * @param text - JSON string to parse
 * @param fallback - value returned on parse failure
 * @returns parsed `T`, or `fallback` if parsing fails.
 */
export function jsonParseOr<T,>(text: string, fallback: T,): T {
  const result = safeJsonParse<T>(text,);
  return result.ok ? result.value : fallback;
}

// ── Stringify ────────────────────────────────────────────────

/** Options for safeJsonStringify */
export interface SafeJsonStringifyOptions {
  /** Enable double-stringification guard */
  guarded?: boolean;
  /** Number of spaces to use for indentation */
  space?: number;
}

/**
 * Stringify JSON safely. Never throws — returns a discriminated union.
 * @param value - value to serialize
 * @param spaceOrOptions - number of spaces, or `{ guarded?, space? }` options object
 * @returns `{ ok: true, value: string }` on success, `{ ok: false, error }` on serialization failure.
 */
export function safeJsonStringify(
  value: unknown,
  spaceOrOptions?: number | SafeJsonStringifyOptions,
): JsonResult<string> {
  try {
    let space: number | undefined;
    let guarded = false;

    if (typeof spaceOrOptions === "number") {
      space = spaceOrOptions;
    } else if (spaceOrOptions) {
      guarded = spaceOrOptions.guarded ?? false;
      space = spaceOrOptions.space;
    }

    let toStringify = value;
    if (guarded && typeof value === "string") {
      try {
        toStringify = JSON.parse(value,) as unknown;
      } catch {
        // value is not a valid JSON string — stringify as-is
      }
    }
    return { ok: true, value: JSON.stringify(toStringify, null, space,), };
  } catch (error) {
    return { ok: false, error: asError(error,), };
  }
}

/**
 * Stringify JSON safely with a fallback value.
 * Never throws.
 * @param value - value to serialize
 * @param fallback - string returned on serialization failure (default `"{}"`)
 * @returns JSON string, or `fallback` if serialization fails.
 * @example
 *   jsonStringifyOr({ a: 1 })         // '{"a":1}'
 *   jsonStringifyOr(bad, "[]")         // '[]'
 */
export function jsonStringifyOr(value: unknown, fallback = "{}",): string {
  const r = safeJsonStringify(value,);
  return r.ok ? r.value : fallback;
}

// ── Guards ───────────────────────────────────────────────────

/**
 * Check if a value is a valid JSON string.
 * @param value - value to test
 * @returns `true` if `value` is a string and parses as valid JSON; `false` otherwise (type guard).
 */
export function isJsonString(value: unknown,): value is string {
  if (typeof value !== "string") { return false; }
  try {
    JSON.parse(value,);
    return true;
  } catch {
    return false;
  }
}
