/**
 * Shared Utilities
 *
 * Common helpers used across modules — uid generation,
 * error formatting, and other general-purpose functions.
 */
import { randomUUID, randomBytes } from "node:crypto";

// ── ID Generation ─────────────────────────────────────────────

/** Create a DB-safe UUID string (v4, RFC 4122) */
export const uid = (): string => randomUUID();

/** Create a cryptographically secure random token (32 hex chars = 128 bits) */
export const secureToken = (): string => randomBytes(16).toString("hex");

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
export type JsonResult<T> = { ok: true; value: T } | { ok: false; error: Error };

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

/** Options for safeJsonStringify */
export interface SafeJsonStringifyOptions {
  /** Enable double-stringification guard (prevents double-encoding of JSON strings) */
  guarded?: boolean;
  /** Number of spaces to use for indentation */
  space?: number;
}

/**
 * Stringify JSON safely. Never throws — returns a discriminated union.
 * Handles edge cases like circular references gracefully.
 *
 * @param value - Value to stringify
 * @param spaceOrOptions - Either a number for indentation, or an options object
 * @param options - Options object (when second argument is an object)
 *
 * @example
 * const result = safeJsonStringify(data);
 * if (!result.ok) { handleError(result.error); }
 *
 * @example
 * // Enable double-stringification guard
 * const result = safeJsonStringify(data, { guarded: true });
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

// ── Safe JSON Stringifier with Double-Stringification Guard ─────────

/**
 * Check if a value is a valid JSON string.
 * Returns true if the value is a string that can be parsed as JSON.
 *
 * @example
 * isJsonString('{"a":1}') // true
 * isJsonString('[1,2,3]') // true
 * isJsonString('not json') // false
 * isJsonString(123) // false
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

/**
 * Parse JSON, returning the value or throwing an error.
 * Use when caller needs to distinguish missing vs malformed.
 *
 * @throws {Error} if parse fails
 */
export function jsonParseOrThrow(text: string): unknown {
  const result = safeJsonParse(text);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}
