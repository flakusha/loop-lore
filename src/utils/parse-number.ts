// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe numeric parsing with NaN guards.
 *
 * Bare `parseInt`/`parseFloat` silently return `NaN` on malformed input and
 * also accept trailing garbage (`parseInt("12abc") === 12`). These helpers
 * parse strictly: the whole string must be a valid number.
 */

/** */
export type NumberResult = { ok: true; value: number } | { ok: false; error: Error };

/**
 * Parse a base-10 integer strictly: the whole string must be a valid integer.
 * @param text - Raw input to parse.
 * @returns `{ ok: true, value }` or `{ ok: false, error }`.
 * @example
 * safeParseInt("42"); // { ok: true, value: 42 }
 * safeParseInt("12abc"); // { ok: false, error }
 */
export function safeParseInt(text: string,): NumberResult {
  const trimmed = text.trim();
  const asNumber = Number(trimmed,);
  if (trimmed === "" || !Number.isInteger(asNumber,)) {
    return { ok: false, error: new TypeError(`Not a valid integer: "${text}"`,), };
  }
  return { ok: true, value: asNumber, };
}

/**
 * Parse a float strictly: the whole string must be a valid finite number.
 * @param text - Raw input to parse.
 * @returns `{ ok: true, value }` or `{ ok: false, error }`.
 * @example
 * safeParseFloat("3.14"); // { ok: true, value: 3.14 }
 * safeParseFloat("abc"); // { ok: false, error }
 */
export function safeParseFloat(text: string,): NumberResult {
  const trimmed = text.trim();
  const asNumber = Number(trimmed,);
  if (trimmed === "" || !Number.isFinite(asNumber,)) {
    return { ok: false, error: new TypeError(`Not a valid finite number: "${text}"`,), };
  }
  return { ok: true, value: asNumber, };
}

/**
 * Parse a base-10 integer, falling back on invalid input.
 * @param text - Raw input to parse.
 * @param fallback - Value returned when parsing fails.
 * @returns Parsed integer or `fallback`.
 * @example
 * parseIntOr("7", 0); // 7
 * parseIntOr("x", 0); // 0
 */
export function parseIntOr(text: string, fallback: number,): number {
  const result = safeParseInt(text,);
  return result.ok ? result.value : fallback;
}

/**
 * Parse a float, falling back on invalid input.
 * @param text - Raw input to parse.
 * @param fallback - Value returned when parsing fails.
 * @returns Parsed finite number or `fallback`.
 * @example
 * parseFloatOr("1.5", 0); // 1.5
 * parseFloatOr("x", 0); // 0
 */
export function parseFloatOr(text: string, fallback: number,): number {
  const result = safeParseFloat(text,);
  return result.ok ? result.value : fallback;
}

/**
 * Parse a model parameter-size string into billions of parameters.
 *
 * Provider-reported sizes carry an SI suffix ("8B", "3.2B", "110M") that the
 * strict `parseFloatOr` rejects (it requires the whole string to be a bare
 * number). This helper strips a trailing `B`/`M` suffix and scales to the
 * billion-count tier scale: `"8B"` → 8, `"110M"` → 0.11, `"13"` → 13.
 * A bare number is assumed already in billions (backward-compatible with the
 * pre-suffix tier thresholds).
 *
 * @param text - Raw size string, e.g. "8B", "70B", "110M", "13".
 * @returns Parameter count in billions, or `NaN` when unparseable.
 * @example
 * parseParamSize("8B");   // 8
 * parseParamSize("110M"); // 0.11
 * parseParamSize("huge"); // NaN
 */
export function parseParamSize(text: string,): number {
  const match = /^(\d+(?:\.\d+)?)\s*([bBmM])?$/.exec(text.trim(),);
  if (!match) { return Number.NaN; }
  const value = Number(match[1],);
  if (!Number.isFinite(value,)) { return Number.NaN; }
  return match[2]?.toUpperCase() === "M" ? value / 1000 : value;
}
