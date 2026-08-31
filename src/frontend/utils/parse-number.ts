// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser-local strict numeric parsing. Mirrors src/utils/parse-number.ts
 * (frontend cannot import backend utils — see frontend/alpine/json.ts
 * precedent for safe-json). Keep the two in sync.
 */

/** */
export type NumberResult = { ok: true; value: number } | { ok: false; error: Error };

/**
 * Parse a base-10 integer strictly: the whole string must be a valid integer.
 * @param text - Raw input to parse.
 * @returns `{ ok: true, value }` or `{ ok: false, error }`.
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
 */
export function parseFloatOr(text: string, fallback: number,): number {
  const result = safeParseFloat(text,);
  return result.ok ? result.value : fallback;
}
