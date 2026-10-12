// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Default skip patterns for the heavy `bun test` gates. Each entry is a
 * substring matched against the test file path; matches are removed from the
 * path list passed to `bun test`. Bun's own `--path-ignore-patterns` glob
 * flag did not reliably exclude files on 1.4.2 (verified: --exclude and
 * --path-ignore-patterns both still ran `src/db/migrations.test.ts`), so
 * the runner builds a filtered path list at command-build time instead.
 *
 * Why the list is empty:
 *   It used to hold `src/db/migrations.test.ts` and
 *   `src/db/migration-roundtrip.test.ts`, justified as "3+ min AND fail".
 *   Both halves are false: the chain is gapless and green in seconds. The
 *   real reason was contention — the two suites share the process-global
 *   `testDatabaseOverride` (`src/db/index.ts`) that every other DB-backed
 *   suite also clears in `afterEach` — but the stated reason hid that behind
 *   a wrong one, and the gapless-chain assertion escaped a green run twice
 *   while skipped. Serial gates (default `CHECK_JOBS=1`) resolve the
 *   contention, so the migration chain is gated by default.
 *
 * Add an entry back only together with a measured reason and the wall-clock
 * cost, and re-verify the gate both with and without it. The env overrides
 * below are inert while this list is empty; they exist so a future skip can
 * be toggled without editing the source.
 *
 * Override (full re-inclusion): `CHECK_INCLUDE_HEAVY_DB_TESTS=1` → empty
 * skip list. Per-pattern override: `CHECK_TEST_KEEP_REGEX='migrations'`
 * removes any pattern whose substring appears in that string (allows
 * trimming the skip set without editing the source).
 */
const DEFAULT_TEST_SKIP_PATTERNS = [];

export const SKIP_PATTERNS = (() => {
  if (process.env.CHECK_INCLUDE_HEAVY_DB_TESTS === "1") { return []; }
  const keep = process.env.CHECK_TEST_KEEP_REGEX;
  const base = DEFAULT_TEST_SKIP_PATTERNS;
  if (!keep) { return base; }
  const re = new RegExp(keep,);
  return base.filter((p,) => !re.test(p,));
})();

const matchesSkip = (p,) => SKIP_PATTERNS.some((pat,) => p.includes(pat,));
export const filterPaths = (paths,) => paths.filter((p,) => !matchesSkip(p,));
