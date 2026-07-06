/**
 * Browser-safe JSON utilities — mirrors the server-side safe wrappers in src/utils.ts
 * but without Node.js dependencies so it can be bundled for the browser.
 */

/** Result of a safe JSON parse or stringify operation */
export type JsonResult<T> = { ok: true; value: T } | { ok: false; error: Error };

/**
 * Parse JSON safely. Never throws — returns a discriminated union.
 */
export function safeJsonParse<T = unknown>(text: string): JsonResult<T> {
  try {
    const value = JSON.parse(text) as T;
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Stringify JSON safely. Never throws — returns a discriminated union.
 * Handles edge cases like circular references gracefully.
 */
export function safeJsonStringify(value: unknown, space?: number): JsonResult<string> {
  try {
    return { ok: true, value: JSON.stringify(value, null, space) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Parse JSON, returning the value or `fallback` on failure.
 */
export function jsonParseOr<T>(text: string, fallback: T): T {
  const result = safeJsonParse<T>(text);
  return result.ok ? result.value : fallback;
}

/**
 * Safely stringify to a JSON body string for API requests.
 * Throws on failure (caught by existing try/catch blocks around apiFetch calls).
 */
export function jsonBody(data: unknown): string {
  const r = safeJsonStringify(data);
  if (!r.ok) throw r.error;
  return r.value;
}
