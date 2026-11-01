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
 *      (the classic `(a+)+` / `(a|)*` / `(a{2,3}){2,}` ReDoS shapes), or a
 *      quantified group whose top-level alternation has two branches where
 *      one is a literal prefix of the other (`(a|aa)+c`), is rejected.
 *
 * Defense-in-depth, not a completeness proof: blocks the known catastrophic
 * shapes cheaply. Complex patterns should be pre-validated by config authors.
 */

import { getChildLogger, } from "../logger";

export const MAX_SAFE_PATTERN_LENGTH = 512;
/** Default maximum accepted pattern length. */
const GROUP_BODY_QUANTIFIER = /[+*]|\{\d+,?\d*\}/;

/** A quantifier directly following a group close: `+`, `*`, `?`, or a bounded
 *  `{n}` / `{n,}` / `{n,m}` repetition. Anchored — test the slice after `)`,
 *  not a single character, so `(a{2,3}){2,}` cannot pass as "not quantified". */
const ATOM_QUANTIFIER = /^(?:[+*?]|\{\d+,?\d*\})/;

/**
 * Strip the group-open syntax the scanner accumulates at the start of a group
 * body (`(?:` non-capturing, `(?<name>` named) so branch comparison sees the
 * real alternation branches, not group syntax — `(?:a|aa)+` must be judged
 * like `(a|aa)+`. Lookaround markers (`(?=`, `(?!`, `(?<=`) are left in place;
 * that only adds conservatism.
 */
function stripGroupOpen(body: string,): string {
  if (body.startsWith("?:",)) { return body.slice(2,); }
  if (body.startsWith("?<",)) {
    const gt = body.indexOf(">", 2,);
    if (gt !== -1) { return body.slice(gt + 1,); }
  }

  return body;
}

/**
 * Split a group body into its top-level `|` alternation branches: a plain
 * string-level scan that skips escaped characters and character-class spans
 * (a `|` inside `[...]` is a literal, not a branch separator). Nested-group
 * text has already been collapsed by the scanner's body accumulation.
 */
function topLevelAlternationBranches(body: string,): string[] {
  const branches: string[] = [];
  let current = "";
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "\\" && i + 1 < body.length) {
      current += body.slice(i, i + 2,);
      i++;
      continue;
    }

    if (inClass) {
      if (ch === "]") { inClass = false; }
      current += ch;
      continue;
    }

    if (ch === "[") {
      inClass = true;
      current += ch;
      continue;
    }

    if (ch === "|") {
      branches.push(current,);
      current = "";
      continue;
    }

    current += ch;
  }

  branches.push(current,);
  return branches;
}

/**
 * Whether any two non-empty alternation branches overlap: one is a literal
 * (source-text) prefix of the other — `(a|aa)`, `(http|https)`, `(x|x)`.
 * Under a quantifier, such branches allow several match partitions for the
 * same subject — the driver of catastrophic backtracking. Source-text
 * comparison is conservative: branches that only overlap after expansion
 * (e.g. `\d` vs `0`) are accepted.
 */
function hasOverlappingBranches(branches: string[],): boolean {
  for (let i = 0; i < branches.length; i++) {
    for (let j = 0; j < branches.length; j++) {
      if (i === j) { continue; }
      const a = branches[i]!;
      const b = branches[j]!;
      if (a.length > 0 && b.length > 0 && b.startsWith(a,)) { return true; }
    }
  }

  return false;
}

/**
 * Compile `pattern` safely, or return null when it must not run.
 * Null means "treat as no-match" at the call site — never throw.
 * @param pattern - regex source string
 * @param flags - regex flags (default empty)
 * @param maxLength - maximum accepted pattern length (default `MAX_SAFE_PATTERN_LENGTH`)
 * @returns compiled `RegExp`, or `null` when the pattern is empty, too long, has catastrophic shape, or fails to compile.
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
  } catch (error) {
    // Invalid pattern is expected input (config/authors); log at debug, never throw.
    getChildLogger("utils/safe-regexp",)?.debug("compileSafeRegExp: pattern failed to compile", {
      patternLength: pattern.length,
      flags,
      err: error,
    },);

    return null;
  }
}

/**
 * Conservative catastrophic-backtracking shape check: rejects a quantifier
 * immediately following a group whose body contains a quantifier, an empty
 * alternation branch, or top-level alternation branches where one is a
 * literal prefix of another.
 * @param pattern - regex source string
 * @returns `true` when the pattern has no catastrophic shape; `false` when a `((a|))+` / `(a+)+` / `(a|aa)+` shape is detected.
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
      const groupQuantified = ATOM_QUANTIFIER.test(pattern.slice(i + 1,),);
      // Escaped sequences (\+, \{) are inert — mask them before scanning.
      const unescaped = closedBody.replace(/\\./g, "ES",);
      if (groupQuantified && (GROUP_BODY_QUANTIFIER.test(unescaped,) || closedEmpty)) {
        return false;
      }

      if (
        groupQuantified &&
        hasOverlappingBranches(topLevelAlternationBranches(stripGroupOpen(closedBody,),),)
      ) {
        return false;
      }

      emptyBranch = outer.emptyBranch || closedEmpty;
      continue;
    }

    body += ch;
  }

  return true;
}
