/**
 * Safe JSON operations — no Node.js dependencies.
 *
 * Pure JS functions for safe parse/stringify that work in browser + server.
 */

// ── Result Type ──────────────────────────────────────────────

/** Result of a safe JSON parse or stringify operation */
export type JsonResult<T> = { ok: true; value: T } | { ok: false; error: Error };

// ── Error Helper ─────────────────────────────────────────────

/** Extract a safe Error object from an unknown thrown value */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// ── Parse ────────────────────────────────────────────────────

/**
 * Parse JSON safely. Never throws — returns a discriminated union.
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
 * Parse JSON, returning the value or `fallback` on failure.
 */
export function jsonParseOr<T>(text: string, fallback: T): T {
  const result = safeJsonParse<T>(text);
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

    const toStringify = guarded && isJsonString(value) ? (JSON.parse(value) as unknown) : value;
    return { ok: true, value: JSON.stringify(toStringify, null, space) };
  } catch (error) {
    return { ok: false, error: asError(error) };
  }
}

// ── Guards ───────────────────────────────────────────────────

/**
 * Check if a value is a valid JSON string.
 */
export function isJsonString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
