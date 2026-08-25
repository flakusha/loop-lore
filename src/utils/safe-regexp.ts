// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe RegExp compilation for untrusted patterns (config transforms, imported
 * character cards, shared presets).
 *
 * Bun/JS has no RE2; this is a conservative static guard:
 *   1. Length cap — long patterns amplify backtracking cost.
 *   2. Syntactic validity — invalid patterns return null, never throw.
 *   3. Catastrophic-shape rejection — a quantifier applied to a group whose
 *      body itself contains a quantifier or an empty alternation branch
 *      (the classic `(a+)+` / `(a|)*` ReDoS shapes) is rejected.
 *
 * Defense-in-depth, not a completeness proof: blocks the known catastrophic
 * shapes cheaply. Complex patterns should be pre-validated by config authors.
 */

export const MAX_SAFE_PATTERN_LENGTH = 512;
/** Default maximum accepted pattern length. */
const GROUP_BODY_QUANTIFIER = /[+*]|\{\d+,?\d*\}/;

const ATOM_QUANTIFIER = /[+*?]/;

/**
 * Compile `pattern` safely, or return null when it must not run.
 * Null means "treat as no-match" at the call site — never throw.
 */
export function compileSafeRegExp(
  pattern: string,
  flags = "",
  maxLength: number = MAX_SAFE_PATTERN_LENGTH,
): RegExp | null {
  if (pattern.length === 0 || pattern.length > maxLength) { return null; }
  if (!hasSafeShape(pattern,)) { return null; }
  try {
    return new RegExp(pattern, flags,);
  } catch {
    return null;
  }
}

/**
 * Conservative catastrophic-backtracking shape check: rejects a quantifier
 * immediately following a group whose body contains a quantifier or an
 * empty alternation branch.
 */
export function hasSafeShape(pattern: string,): boolean {
  // Per-group frame: accumulated body text + whether any alternation branch
  // (at any depth) can match empty. The flag propagates through group
  // wrappers — reconstruction alone hides `((a|))+`-style shapes.
  const groupStack: Array<{ body: string; emptyBranch: boolean }> = [];
  let body = "";
  let emptyBranch = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      body += pattern.slice(i, i + 2,);
      i++;
      continue;
    }
    if (ch === "(") {
      groupStack.push({ body, emptyBranch, },);
      body = "";
      emptyBranch = false;
      continue;
    }
    if (ch === "|") {
      // Empty branch when nothing precedes this "|" (start or after "|").
      if (body.length === 0 || body.endsWith("|",)) { emptyBranch = true; }
      body += "|";
      continue;
    }
    if (ch === ")") {
      // Empty trailing branch: body ends with "|" (e.g. "(a|)").
      if (body.length === 0 || body.endsWith("|",)) { emptyBranch = true; }
      const closedBody = body;
      const closedEmpty: boolean = emptyBranch;
      const outer = groupStack.pop() ?? { body: "", emptyBranch: false, };
      const next = pattern[i + 1];
      const groupQuantified = next !== undefined && ATOM_QUANTIFIER.test(next,);
      // Escaped sequences (\+, \{) are inert — mask them before scanning.
      const unescaped = closedBody.replace(/\\./g, "ES",);
      if (groupQuantified && (GROUP_BODY_QUANTIFIER.test(unescaped,) || closedEmpty)) {
        return false;
      }
      emptyBranch = outer.emptyBranch || closedEmpty;
      continue;
    }
    body += ch;
  }
  return true;
}
