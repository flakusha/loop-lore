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
 * Why these defaults:
 *   - `src/db/migrations.test.ts` / `src/db/migration-roundtrip.test.ts`
 *     hold the SQLite write-lock for the entire migration chain (full up +
 *     full down roundtrip), serialize behind `--parallel=4`, and the FTS5
 *     trigger dependency on `001_init.down()` is broken pre-fix
 *     (migration 013_generation.ts DROP TABLE fires
 *     `actor_memories_fts_ad` against the already-dropped `memories_fts`).
 *     Until the upstream migration is fixed (see
 *     .plan/tickets/TASK-coverage-gate-true-multi-worker-fanout-investigation.md),
 *     these tests take 3+ min AND fail, which made `giwt finalize` blow
 *     past any caller timeout. Skipping by default restores sub-5min
 *     finalize; the heavy suite stays one env override away.
 *
 * Override (full re-inclusion): `CHECK_INCLUDE_HEAVY_DB_TESTS=1` → empty
 * skip list. Per-pattern override: `CHECK_TEST_KEEP_REGEX='migrations'`
 * removes any pattern whose substring appears in that string (allows
 * trimming the skip set without editing the source).
 */
const DEFAULT_TEST_SKIP_PATTERNS = [
  "src/db/migrations.test.ts",
  "src/db/migration-roundtrip.test.ts",
];

export const SKIP_PATTERNS = (() => {
  if (process.env.CHECK_INCLUDE_HEAVY_DB_TESTS === "1") { return []; }
  const keep = process.env.CHECK_TEST_KEEP_REGEX;
  const base = DEFAULT_TEST_SKIP_PATTERNS;
  if (!keep) { return base; }
  const re = new RegExp(keep);
  return base.filter((p) => !re.test(p));
})();

export const matchesSkip = (p) => SKIP_PATTERNS.some((pat) => p.includes(pat));
export const filterPaths = (paths) => paths.filter((p) => !matchesSkip(p));
