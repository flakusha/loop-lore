// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Numeric bounds clamping helpers.
 *
 * `clamp` constrains a finite number to `[min, max]`.
 * `clampUnit` constrains a finite number to `[0, 1]` (unit interval) and falls
 * back to `0.5` when the input is `NaN`/`±Infinity` — a safe default for
 * confidence scores that must always be present in downstream heuristics.
 */

/**
 * Constrain `value` to the inclusive range `[min, max]`.
 *
 * Returns `NaN` unchanged so callers can distinguish "clamped" from
 * "non-finite" — useful when callers want to substitute a default on
 * non-finite input via `clampUnit`.
 *
 * @param value - Number to clamp
 * @param min - Lower bound (inclusive)
 * @param max - Upper bound (inclusive)
 * @returns `max` if `value > max`, `min` if `value < min`, else `value`
 *
 * @example
 * clamp(1.5, 0, 1); // 1
 * clamp(-0.5, 0, 1); // 0
 * clamp(0.7, 0, 1); // 0.7
 */
export function clamp(value: number, min: number, max: number,): number {
  if (value < min) { return min; }
  if (value > max) { return max; }
  return value;
}

/**
 * Constrain `value` to the unit interval `[0, 1]`. Non-finite input
 * (`NaN`, `±Infinity`) returns `fallback` (defaults to `0.5`).
 *
 * Designed for confidence/probability scores parsed from external sources
 * (LLM responses, user input, config files) where the contract is
 * `0.0–1.0` but untrusted callers may emit out-of-range or non-numeric
 * values.
 *
 * @param value - Number to clamp
 * @param fallback - Value to return when `value` is not finite (default `0.5`)
 * @returns `value` clamped to `[0, 1]`, or `fallback` for non-finite input
 *
 * @example
 * clampUnit(1.5);                       // 1
 * clampUnit(-0.5);                      // 0
 * clampUnit(NaN);                       // 0.5
 * clampUnit(Number.POSITIVE_INFINITY); // 0.5
 * clampUnit(Number.NaN, 0);             // 0
 */
export function clampUnit(value: number, fallback: number = 0.5,): number {
  if (!Number.isFinite(value,)) { return fallback; }
  return clamp(value, 0, 1,);
}
