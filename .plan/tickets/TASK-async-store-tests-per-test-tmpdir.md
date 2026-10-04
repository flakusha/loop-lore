<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# async-store tests use per-test OFFLOAD_DIR + deterministic teardown

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** Migrate every `src/async/*test*.ts` to a unique `OFFLOAD_DIR` under `os.tmpdir()/loop-lore-test-<uuid>/` with deterministic teardown.
**Context:** Broader fix for the same root cause as `BUG-test-async-store-offload-dir-fixed-path-race.md`; `offload.test.ts` already has a dead `tmpRoot` block — actual paths still join the shared `OFFLOAD_DIR`.
**Acceptance Criteria:** [see body — per-test or per-file tmpdir override, resource-contract header, runner-level guard]

## Summary

Broader fix for the same root cause as `BUG-test-async-store-offload-dir-fixed-path-race.md`: `src/async/spill.ts:12` defines `OFFLOAD_DIR = path.resolve(".tmp", "async-store")` — a fixed, repo-relative path shared by the running app, every test file, and every concurrent test process. Ticket 1 adds an immediate guard; this ticket migrates every `src/async/*test*.ts` file to a unique `OFFLOAD_DIR` per test file under `/tmp/loop-lore-test-<uuid>/` with per-test cleanup (preferable) or `beforeAll`/`afterAll` per-file cleanup (acceptable when per-test ids are already unique, as in `src/async/spill.test.ts`), and adds a runner-level assertion that no async-store test points at `<repo>/.tmp/async-store`.

## Repro / Current state

- All three test files in scope — `src/async/offload.test.ts`, `src/async/offload-daemon.test.ts`, `src/async/spill.test.ts` — import `OFFLOAD_DIR` directly from `./offload` or `./spill` and write fixtures into it (`corrupt.json.gz`, `req-roundtrip.json.gz`, `offload-spill-unit.json.gz`, `offload-spill-twice.json.gz`, `fallback-1.json.gz`, `override-1.json.gz`). Verified via `grep -rln 'corrupt.json.gz\|offload-spill\|req-roundtrip\|fallback-1' src/`.
- `offload.test.ts` already has a `tmpRoot = ".tmp/async-store-test"` `beforeEach/afterEach` block (lines 21-31) but the actual file paths inside the tests join `OFFLOAD_DIR` (lines 42, 56, 60), so `tmpRoot` is dead code. This is the canonical example of the parallel-safety rule being half-implemented.
- Measured leak rate from `.tmp/scratchpad-audit/e2e-matrix2.txt`: +1 file leaked per arm with `E2E_SAFEGUARD` unset; +2 files leaked per arm with `E2E_SAFEGUARD=1`.

## Acceptance Criteria

1. Every `src/async/*test*.ts` file overrides `OFFLOAD_DIR` (or equivalent — e.g. a `process.env.OFFLOAD_DIR` reader in `spill.ts`) to a unique path under `os.tmpdir()/loop-lore-test-<uuid>/` (one per test file, allocated in `beforeAll`). Cleanup preference (per `rule://parallel-safe-tests`):
   - **Per-test** (`beforeEach`/`afterEach` or `finally`) — REQUIRED when tests reuse ids or share any cross-test state. This is the default for new code; a fail-mid-file must not leak.
   - **Per-file** (`beforeAll`/`afterAll`) — acceptable only when every test in the file uses a unique id (e.g. `uid()`-derived, as in `src/async/spill.test.ts:34,38`). State this explicitly in the file header.
   The override MUST be visible to the module under test (set before the import is bound, or via a `setOffloadDir()` test seam on `./spill`). Each test file's header MUST include a `Resource contract (parallel-safe): …` block naming what each test owns, matching the canonical wording in `scripts/worktree/finalize-signal-safety.test.ts:7`, `src/assets/serve-handlers.coverage.test.ts:14`, `scripts/worktree/find-worktree.test.ts:8`. Passes alone, in any order; no shared globals; no ordering dependence.
2. CI gate `bun run test:unit` AND the canonical e2e gate (`E2E_SAFEGUARD=1 bun test --parallel=4 --isolate tests/e2e/`) are both green.
3. `.tmp/async-store/` file count is unchanged (or reduced) after running the full suite. Re-run `.tmp/scratchpad-audit/e2e-matrix2.sh`; both arms must report delta `+0` (or negative — clean-up of pre-existing residue is acceptable).
4. New unit test: a runner-level assertion that, for every `src/async/*test*.ts` file, the module-level `OFFLOAD_DIR` (or `process.env.OFFLOAD_DIR` after resolution) is NOT a path that contains `<repo>/.tmp/async-store`. This is the guard from `BUG-test-async-store-offload-dir-fixed-path-race.md` generalized to a permanent assertion rather than a per-file `beforeEach`.
5. Cross-reference: `.plan/tickets/BUG-test-async-store-offload-dir-fixed-path-race.md` (the immediate guard ticket).
6. End-goal performance: the suite must run seconds-fast under `--parallel=4 --isolate` (the project's verify-gate shape); serial minute-long suites are unacceptable. `-j 1` is acceptable for shakeout only — the committed fix MUST be fast under the parallel gate.

## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §D-03
- Sibling immediate guard: `.plan/tickets/BUG-test-async-store-offload-dir-fixed-path-race.md`
- Parallel-safe-tests convention references: `scripts/worktree/finalize-signal-safety.test.ts:7`, `src/assets/serve-handlers.coverage.test.ts:14`, `scripts/worktree/find-worktree.test.ts:8`

git issue: 968fd6b