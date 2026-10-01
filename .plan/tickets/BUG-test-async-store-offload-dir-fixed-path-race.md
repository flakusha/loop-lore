<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# async-store tests share fixed OFFLOAD_DIR with runtime and concurrent tests

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Type:** Bug
**Summary:** Add an immediate `beforeEach` guard that fails any async-store test pointing at the shared `OFFLOAD_DIR`.
**Context:** Parallel-safety defect (`src/async/spill.ts:12` defines a fixed `OFFLOAD_DIR = path.resolve(".tmp", "async-store")`); concurrent tests race on shared file ops and leak residue into the running app's spill dir.
**Acceptance Criteria:** [see body — per-test guard or per-test tmpdir override; deterministic teardown]

## Summary

`OFFLOAD_DIR` is defined as `path.resolve(".tmp", "async-store")` in `src/async/spill.ts:12` — a fixed, repo-relative path. Every `src/async/*test*.ts` file (`offload.test.ts`, `offload-daemon.test.ts`, `spill.test.ts`) reads this constant directly with no per-test override and no teardown, so:

1. The running app, every test file, and every parallel test process all write into the same directory.
2. With `--parallel=4 --isolate`, concurrent tests race on `mkdirSync` / `writeFileSync` / `readdirSync` and leave residue that bleeds into the next suite run (and into the running app's spill dir).
3. The canonical e2e matrix (`E2E_SAFEGUARD` unset, `E2E_SAFEGUARD=1`) measured +1 / +2 files left in `.tmp/async-store/` per full e2e arm — direct evidence of leaked state from a green suite.

This is a parallel-safety defect: violates the project rule that tests must own unique resources and have deterministic teardown. Symptom is "stale `.tmp/async-store` content after green runs"; root cause is the shared fixed path.

## Repro / Current state

- Fixtures currently in `/home/flak/git-ai/loop-lore/.tmp/async-store/` (verify with `ls -la .../async-store/`):
  - `corrupt.json.gz` (13 B; contents `not-gzip-data`) — from `src/async/offload.test.ts:60-63`
  - `req-roundtrip.json.gz` — from `src/async/offload.test.ts:41`
  - `fallback-1.json.gz` — from `src/async/offload-daemon.test.ts:229`
  - `override-1.json.gz` — from `src/async/offload-daemon.test.ts` (override-1 fixture)
  - `offload-spill-unit.json.gz` — from `src/async/offload-daemon.test.ts:82`
  - `offload-spill-twice.json.gz` — from `src/async/offload-daemon.test.ts:95-96`
- No test file overrides `OFFLOAD_DIR`. `grep -n OFFLOAD_DIR src/async/offload.test.ts src/async/offload-daemon.test.ts src/async/spill.test.ts` shows only imports + direct path-join calls (`path.join(OFFLOAD_DIR, "...")`); no `beforeAll`/`afterAll` `rmSync`, no `process.env.OFFLOAD_DIR` override. `offload.test.ts` has a `tmpRoot = ".tmp/async-store-test"` `beforeEach/afterEach`, but the tests inside still write under the imported `OFFLOAD_DIR` (line 42, 60, 56) — `tmpRoot` is unused for the actual file paths.
- Measured leak rate, canonical e2e arms (`E2E_SAFEGUARD` unset → 1 file leaked; `E2E_SAFEGUARD=1` → 2 files leaked), source `.tmp/scratchpad-audit/e2e-matrix2.txt`:

  ```
  == A: canonical, safeguard UNSET (test:e2e shape) ==
  29 fail  631 expect() calls Ran 277 tests across 33 files. [3.51s]
     spill files: 285 -> 286 (delta +1)
  == B: canonical, E2E_SAFEGUARD=1 ==
  0 fail  696 expect() calls Ran 277 tests across 33 files. [3.62s]
     spill files: 286 -> 288 (delta +2)
  ```

- Reproduce on a fresh shell (single-threaded to avoid OOM):

  ```
  ls .tmp/async-store | wc -l                          # before
  E2E_SAFEGUARD=1 bun test --parallel=4 --isolate src/async/
  ls .tmp/async-store | wc -l                          # after — delta > 0
  ```

## Acceptance Criteria

1. Add a `beforeEach` guard that **fails any test** whose `process.env.OFFLOAD_DIR` (or the resolved module-level `OFFLOAD_DIR`) points at `<repo>/.tmp/async-store`. Cite the project's `rule://parallel-safe-tests` (parallel-safe-tests convention: unique resource per test, deterministic teardown — see `finalize-signal-safety.test.ts:7`, `serve-handlers.coverage.test.ts:14`, `find-worktree.test.ts:8` for the canonical wording).
2. Acceptable alternative: override `OFFLOAD_DIR` to `os.tmpdir()/loop-lore-test-<uuid>` in a top-level `beforeAll`, and `rm -rf` it in a top-level `afterAll`, in every `src/async/*test*.ts` file. Either form satisfies the rule; the guard form is preferred because it makes regressions loud.
3. Re-run `e2e-matrix2.sh` after the fix: `.tmp/async-store` file count must be unchanged (or reduced) after both arms.
4. Resource contract (per `rule://parallel-safe-tests`): each test owns a unique `os.tmpdir()/loop-lore-test-<uuid>/` OFFLOAD_DIR; release in `afterEach` (per-test) or `finally` (per-test) — never `afterAll`-only, because a fail-mid-file otherwise leaks; no shared globals; passes alone, in any order. Document the contract in the test file's header comment ("Resource contract (parallel-safe): …"), matching the canonical wording in `scripts/worktree/finalize-signal-safety.test.ts:7`, `src/assets/serve-handlers.coverage.test.ts:14`, and `scripts/worktree/find-worktree.test.ts:8`. End goal: seconds-fast pre-commit hook under `--parallel=4 --isolate`; serial minute-long suites are unacceptable.
5. Verification-execution note (mandatory): running this test fix verification MUST NOT be concurrent with another test suite or `bun run check`. The repo host OOMs on two parallel bun-test processes (AGENTS.md). Run arms sequentially; `-j 1` is acceptable for shakeout only — the committed fix MUST be fast under the project's verify gate.


## Fix landed — worktree `fix-embeddings-orphan-cascade`

The shared constant is gone rather than guarded, so this ticket and
`BUG-async-spill-offload-dir-is-a-fixed-cwd-relative-path-shared-` are one fix:

- `src/async/spill.ts` exports `SPILL_ROOT` (repo-local `.tmp/async-store`,
  still CWD-relative so each worktree stays separate) plus `offloadDir()` and a
  `setOffloadDir()` test seam. The default namespace is `SPILL_ROOT/<pid>`, so
  the app, every suite and every parallel process no longer share one directory.
  The `OFFLOAD_DIR` const is removed outright — no shim.
- `pruneOrphanSpills` now defaults to `SPILL_ROOT` and descends one level into
  each `<pid>` namespace, so files left by a dead process are still collected
  (a flat scan of the current namespace would never see them).
- All four `src/async/*test*.ts` files install a unique `mkdtempSync`
  namespace in `beforeEach`, restore the default in `afterEach`, and rm -rf the
  directory — satisfying criteria 2 and 4. `offload.test.ts` had a `tmpRoot`
  that was created but never used for the actual paths; that dead code is gone.
- Restart safety is unchanged: `readOffloadedBody()` resolves the absolute
  `request_results.offload_path`, so a row written by a previous pid still
  reads back after a restart.

Verified: `bun test src/async/` 57 pass; `src/middleware/ src/routes/requests/
src/async/` 409 pass; spill-file count under `.tmp/async-store` unchanged
across a green run (0 leaked). Criterion 3's `e2e-matrix2.sh` harness is not
checked in, so it was replaced by a direct before/after spill-file count. Four
concurrent `bun test src/async/` arms pass 57/57 each.

On the full-suite failures (the `auth`, `admin`, `autonomy-panel`, `lora`,
`tunnel-connector` groups): these are pre-existing and NOT attributable by
comparing one run per tree, because the suite is nondeterministic. Three
identical `bun test src/` runs on unmodified `dev` produced 27, 55 and 53
failures. Against dev's worst run (55) the worktree also fails 55, split
14-only-here / 14-only-on-dev, and the dev-only side includes `image-edit`,
`AutonomyScheduler`, `ChatCreateBody` and `asyncStore.fail` suites this change
cannot reach. So the failures are cross-file global-state pollution whose
victims shift run to run, not a regression from this diff.

Empty `<pid>` namespace directories were originally left behind (one per
process that ever spilled). That was unbounded growth once the sweep started
scanning the root, so `pruneOrphanSpills` now drops emptied namespace
directories on both exit paths — see the second commit on the branch.

## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §D-03 (OFFLOAD_DIR race)
- Sibling cleanup ticket: `.plan/tickets/TASK-async-store-tests-per-test-tmpdir.md`
- Canonical evidence: `.tmp/scratchpad-audit/e2e-matrix2.sh` + `.tmp/scratchpad-audit/e2e-matrix2.txt`

git issue: 3cbb21e