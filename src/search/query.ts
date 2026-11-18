// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure query-building helpers shared by the unified search route and the
 * message search provider.
 */

/**
 * Turn raw user input into a safe FTS5 MATCH query.
 *
 * Each whitespace-separated token is wrapped in double quotes (escaping inner
 * quotes) so it is treated as a literal phrase/term rather than an operator.
 * Tokens are joined with a space (FTS5 default AND). This prevents FTS query
 * syntax errors and injection via operators like `->`, `*`, or `NEAR`.
 * @param raw
 * @returns {string}
 */
export function buildFtsQuery(raw: string,): string {
  const tokens: string[] = [];
  for (const t of raw.split(/\s+/,)) {
    if (t.length > 0) {
      tokens.push(`"${t.replaceAll('"', '""',)}"`,);
    }
  }

  return tokens.join(" ",);
}

/**
 * Escape SQL LIKE metacharacters so a user-supplied pattern matches literally
 * (paired with `ESCAPE '\\'` in the clause).
 * @param pattern
 * @returns {string}
 */
export function escapeLike(pattern: string,): string {
  return pattern.replaceAll("\\", "\\\\",).replaceAll("%", "\\%",).replaceAll("_", "\\_",);
}
