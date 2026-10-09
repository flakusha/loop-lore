// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure slash-token query helpers.
 *
 * Extracted from slash-autocomplete.ts to keep the Alpine state slice under
 * the 250L limit: the parsing/ranking half is DOM-free and unit-testable on
 * its own, the stateful half is not.
 */

/**
 * Match a `/`-prefixed command token within the text-before-caret.
 * - (?:^|\s) requires the token to start at line start or after whitespace,
 *   so emails/URLs/words do not accidentally trigger.
 * - The captured name is optional so a bare `/` still opens the popover.
 * - The trailing lookahead `(?=\s|$)` accepts the token when followed by
 *   whitespace (user typing args like `/roll 2d6`) or end-of-string, without
 *   consuming the whitespace so subsequent calls re-match the same token.
 */
export const slashTokenRe = /(?:^|\s)\/([a-z][a-z0-9_-]*)?(?=\s|$)/i;

/**
 * Find the slash token that ENDS at the caret (end of `text`). Only such a
 * token may trigger interception, so stale tokens earlier in the message
 * (e.g. a fully typed `/cmd args`) never do.
 * @param text - Text up to and including the caret position.
 * @returns The match whose end equals `text.length`, or null.
 */
export function findCaretToken(text: string,): RegExpExecArray | null {
  const anchored = new RegExp(slashTokenRe.source, "g",);
  for (let m = anchored.exec(text,); m; m = anchored.exec(text,)) {
    if (m.index + m[0].length === text.length) { return m; }
  }

  return null;
}

export interface SlashCandidate {
  name: string;
  description: string;
  descriptionKey: string;
}

/**
 * Extract the slash-token query from text-up-to-caret.
 * @param beforeCursor - textarea value sliced to selectionStart.
 * @returns lowercase query string (no leading `/`), or null when no slash
 *   token is present at the caret.
 */
export function extractSlashQuery(beforeCursor: string,): string | null {
  const match = findCaretToken(beforeCursor,);
  if (!match) { return null; }
  return (match[1] ?? "").toLowerCase();
}

/**
 * Filter and order slash candidates by case-insensitive substring match.
 * @param names - available command names (registry order preserved).
 * @param query - lowercase substring to match against each name.
 * @returns names whose lowercased form contains the query, in registry
 *   order. Empty query returns every name.
 */
export function filterSlashCandidates(
  names: readonly string[],
  query: string,
): string[] {
  if (query === "") { return [...names,]; }
  const out: string[] = [];
  const needle = query.toLowerCase();
  for (const name of names) {
    if (name.toLowerCase().includes(needle,)) { out.push(name,); }
  }

  if (out.length > 0) { return out; }
  const suggestion = didYouMeanCandidate(names, needle,);
  return suggestion === null ? [] : [suggestion,];
}

/**
 * Bounded Levenshtein distance (iterative, single row). Canonical home — both
 * composer modules share this one instead of each carrying a copy.
 * @param a
 * @param b
 * @returns Levenshtein distance between the lowercased inputs.
 */
export function editDistance(a: string, b: string,): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let prev: number[] = Array.from({ length: y.length + 1, }, (_, i,) => i,);
  for (let i = 1; i <= x.length; i++) {
    const curr: number[] = [i,];
    for (let j = 1; j <= y.length; j++) {
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }

    prev = curr;
  }

  return prev[y.length] ?? 0;
}

/**
 * Did-you-mean fallback: closest registry name to a zero-substring-match
 * query, or null when nothing is close enough to suggest. Tab/Enter accepts
 * the suggestion explicitly; Escape dismisses it untouched.
 * @param names - available command names.
 * @param needle - lowercase query with no substring hit.
 * @returns the single closest name, or null.
 */
export function didYouMeanCandidate(names: readonly string[], needle: string,): string | null {
  // ponytail: O(n·m) scan over the ~50-command registry; index it if the list grows 10x.
  const query = needle.toLowerCase();
  if (query === "") { return null; }
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const name of names) {
    const lower = name.toLowerCase();
    const score = lower.startsWith(query,) ? 0 : editDistance(query, lower,);
    if (score < bestScore) {
      bestScore = score;
      best = name;
    }
  }

  if (best === null || bestScore > Math.max(1, Math.floor(query.length / 2,),)) { return null; }
  return best;
}
