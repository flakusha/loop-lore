// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore activation conditions — the pure selective-activation rules for a lore
 * entry, independent of DB access. FEAT-055.
 *
 * A lore entry activates through one of three selective matchers:
 *
 *   - default keyword keys: when one of `keys` appears in the scanned window,
 *   - `key_type === "regex"`: when any of `keys` (compiled as regex) matches the
 *     scanned conversation text,
 *   - `key_groups`: AND/OR keyword groups (inner array = AND, outer = OR).
 *
 * `scan_depth` bounds how many recent user messages are scanned (default 1,
 * cap 10); `activation_chance` (0..1) stochastically gates an otherwise-relevant
 * entry for ambient world-building. Invalid regex patterns are treated as
 * no-match so prompt assembly never crashes on bad author input.
 */
import { compileSafeRegExp, } from "../../../utils/safe-regexp";
import { parseKeyGroups, parseKeywords, } from "../keywords";

/** Maximum number of recent user messages scanned for activation. */
export const MAX_SCAN_DEPTH = 10;

/** The lore-entry fields the activation rules read (a subset of the DB row). */
export interface ActivationEntry {
  keys: unknown;
  key_type: string | null;
  key_groups: string | null;
  scan_depth: number | null;
  activation_chance: number | null;
}

/** Clamp an entry's scan_depth into the valid range (default 1, max {@link MAX_SCAN_DEPTH}). */
export function clampScanDepth(scanDepth: number | null,): number {
  if (scanDepth == null || scanDepth <= 0) { return 1; }
  return Math.min(scanDepth, MAX_SCAN_DEPTH,);
}

/**
 * Compile a lore key into a RegExp, or return null when it is invalid or
 * unsafe. Keys are author/imported-card controlled — safe compile rejects
 * catastrophic-backtracking shapes so a malicious card cannot freeze every
 * chat turn. Invalid patterns are treated as no-match (never crash prompt
 * assembly).
 */
function compileKeyRegex(key: string,): RegExp | null {
  return compileSafeRegExp(key, "i",);
}

/**
 * Test an entry's selective activation against a conversation word set and
 * raw text. Order: regex keys -> key groups (AND/OR) -> plain keyword fallback.
 *
 * An entry with no activation condition at all (no regex keys, no groups, no
 * keywords) is treated as always-active, preserving the pre-FEAT-055 behavior
 * where a selective entry with empty keys is unconditionally included.
 */
export function matchesSelectiveKeys(
  entry: ActivationEntry,
  words: ReadonlySet<string>,
  text: string,
): boolean {
  if (entry.key_type === "regex") {
    const patterns = parseKeywords(entry.keys,);
    if (patterns.length === 0) { return true; }
    for (const key of patterns) {
      const re = compileKeyRegex(key,);
      if (re?.test(text,)) { return true; }
    }
    return false;
  }

  const groups = parseKeyGroups(entry.key_groups,);
  if (groups) {
    for (const group of groups) {
      if (group.every((k,) => words.has(k.toLowerCase(),))) { return true; }
    }
    return false;
  }

  const keys = parseKeywords(entry.keys,);
  if (keys.length === 0) { return true; }
  return keys.some((k,) => words.has(k.toLowerCase(),));
}

/** Whether an otherwise-relevant entry is admitted by its activation_chance. */
export function passesActivationChance(chance: number | null,): boolean {
  if (chance == null) { return true; }
  const clamped = Math.min(1, Math.max(0, chance,),);
  return Math.random() < clamped;
}
