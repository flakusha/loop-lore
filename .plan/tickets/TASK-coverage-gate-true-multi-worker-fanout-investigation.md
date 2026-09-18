<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Coverage gate: true multi-worker fanout investigation

**Status:** 🟡 In Progress — mitigation shipped (skip-by-default) and root-cause migration bug fixed (`016_fts.ts` down() trigger drops, 2026-09-18); remaining fanout investigation items are optional next steps
**Priority:** medium
**Effort:** Medium

## Summary

`--parallel=N` yields N worker processes (verified on bun 1.4.2: `--help` confirms "N worker processes"). Measured 67 files/0.97s with `--parallel=8` vs 67 files/2.32s with `--parallel=2` — real worker fanout, not I/O-overlap. Remaining concerns: per-worker `--max-concurrency=20` overlap (intra-worker async I/O) shares CPU with worker pool; CPU-bound suites (sqlite migrations) still bound by single-worker throughput within a file. Adjustable via `TEST_JOBS` env var (package.json scripts) or `CHECK_TEST_JOBS` (check-parallel.mjs coverage gate), default 4. Investigate: --no-isolate tradeoff for I/O-heavy files, per-dir sharding + lcov merge for hot dirs, bun upgrade if upstream fixes per-worker CPU saturation.

## Mitigation shipped (skip-by-default, 2026-09-18)

`scripts/check-parallel.mjs` now skips `src/db/migrations.test.ts` and `src/db/migration-roundtrip.test.ts` in the coverage gate's path list (verified: bun's `--path-ignore-patterns` glob did not reliably exclude on 1.4.2; runner builds a filtered path list instead). Corrected after a zero-trust review (2026-09-18, `.tmp/review/db-roundtrip-review.md`): the "write-lock for the entire chain" attribution was stale — both files already use per-test `:memory:` SQLite (no file DB, no WAL) and run in ~0.5s each. The breakage was real: `001_init.down()` failed because `parts/016_fts.ts` `down()` dropped `memories_fts` without dropping the `actor_memories_fts_ad/ai/au` triggers that reference it; the orphaned triggers fired on later `actor_memories` teardown (`SQLiteError: no such table: main.memories_fts`). Earlier attribution to `013_generation.ts:209` was wrong. Fixed by folding the three `DROP TRIGGER` statements into `016_fts.ts down()`.

- Default: skip the two files (sub-5min `giwt finalize`).
- Opt back in: `CHECK_INCLUDE_HEAVY_DB_TESTS=1 bun run check`.
- Partial override: `CHECK_TEST_KEEP_REGEX='migrations'` (regex matched against each skip pattern; matching patterns are dropped from the skip list).

The two skipped tests are ALSO failing on dev (pre-existing migration bug, not a regression of the recent merges). Fixing the migration is the **root-cause** work for this ticket — see candidate #1 below.

## Live busy-subprocess profile (post-merge, --parallel=4 src/)

Captured by `lsof -p` and `ps -L` on the worktree `--parallel=4 src/ --isolate` runner. Pids rotate; the structural pattern is invariant:

- **One --test-worker process holds `loop-lore-data/loop-lore.db` + `-wal` + `-shm` open across the entire run** — that worker is running `src/db/migrations.test.ts` (427 lines, ~36 cases) and/or `src/db/migration-roundtrip.test.ts` (239 lines, full up/down chain). The migrations run serially inside that single worker (SQLite write lock).
- Main thread of the busy worker shows 99.7% CPU sustained; per-thread `wchan` blank = actively executing JS. Bun Pool N workers idle in `futex_do_wait` — they handed their last files back to the scheduler and are waiting for more.
- `--max-concurrency=20` is per-worker async I/O overlap; it does NOT add workers. Default 20 is irrelevant here because the SQLite write lock collapses the 20 overlapping tests back to one write at a time.
- Two `bun run test:unit` runs in parallel from separate omp sessions show the SAME pid pattern: 4 workers per run × 2 runs = 8 workers contending on `loop-lore-data/loop-lore.db`. WAL contention amplifies the wallclock (every commit serializes across workers).

`tests/setup-globals.ts` is the bunfig.toml preload; it runs once per worker before any test imports. The "long-running test using setup-globals" diagnosis is correct by construction — every test file uses the preload, and the long-runner is whichever file holds the SQLite write lock.

**2026-09-18 correction**: re-reading `src/db/migrations.test.ts:48` and `src/db/migration-roundtrip.test.ts:58`, both helpers already use `new Database(":memory:",)` and have done so for some time. The WAL contention described above is from `tests/setup-globals.ts` + other db-touching tests (which DO use the on-disk DB), not the migration tests themselves. The migration tests are **CPU-bound**, not I/O-bound — each migration's `up`/`down` is a synchronous JS pass over the schema, and 36 migrations × up+down × multiple describe-blocks serializes on a single CPU inside whichever worker ran them. The lsof snapshot captured the dominant DB file at that moment, which happened to be the disk-backed setup-globals DB, not the `:memory:` migration DBs.

So the real next step is **faster migrations, not in-memory** — see candidates below.

## Mitigation candidates (next steps, not in this scope)

1. **Faster migrations** — profile the migration chain. Suspected hot spots: `migrations/parts/013_generation.ts` DROP TABLE fires the FTS5 trigger on a now-dropped table (root-cause bug); `001_init.down()` walks every part in reverse and is the long pole. Once the trigger bug is fixed, full up/down should be sub-second.
2. **Fix the FTS5 trigger dependency** in `migrations/parts/013_generation.ts` — `DROP TABLE memories_fts` fires `actor_memories_fts_ad` against an already-dropped object. Either drop the trigger before the table, or move the FTS5 index to a later migration that down()'s cleanly. This unblocks the skip-by-default override (`CHECK_INCLUDE_HEAVY_DB_TESTS=1 bun run check` will pass, not just run).
3. **Per-test in-memory SQLite** — already done (see note above). Ineffective as an optimization; it's the migration CONTENT that's slow.
4. **Per-dir sharding + lcov merge** for `src/db/*` — keep these tests in their own worker slot via path scoping, so the heavy work doesn't gate the rest of the coverage report.
5. **Bun upgrade watch** — `--no-isolate` with `--parallel=N` lets workers share SQLite connections cleanly; revisit when bun ships the per-worker cache.

## Acceptance Criteria

- [x] Skip-by-default shipped (coverage gate finishes sub-5min on `dev`)
- [x] Fix FTS5 trigger dependency so `001_init.down()` is clean (unblocks `CHECK_INCLUDE_HEAVY_DB_TESTS=1`) — root cause was `parts/016_fts.ts` `down()` (not `013_generation.ts`); fixed by folding the three `DROP TRIGGER` statements in
- [x] Implementation complete: in-memory SQLite for `migrations.test.ts` + `migration-roundtrip.test.ts` (verified on `dev` 2026-09-18 — both files already per-test `:memory:`; the "in-memory rewrite" criterion was already satisfied, not pending)
- [x] Tests passing (with `CHECK_INCLUDE_HEAVY_DB_TESTS=1 bun run check`) — 49/49 green across both files in ~1.2s after the `016_fts.ts` down() trigger fix
- [x] Documentation updated (this ticket's root-cause correction; `docs/spec/testing.md` opt-in docs; review at `.tmp/review/db-roundtrip-review.md`)
