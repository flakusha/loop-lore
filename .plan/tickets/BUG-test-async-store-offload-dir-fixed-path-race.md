<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# async-store tests share fixed OFFLOAD_DIR with runtime and concurrent tests

**Status:** open
**Priority:** high
**Effort:** Small
**Type:** Bug

**Summary:** `OFFLOAD_DIR` is defined as `path.resolve(".tmp", "async-store")` in `src/async/spill.ts:12` — a fixed, repo-relative path. Every `src/async/*test*.ts` file (`offload.test.ts`, `offload-daemon.test.ts`, `spill.test.ts`) reads this constant directly with no per-test override and no teardown, so:

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

**Context:** Filed via giwt template lacking required bold sections; normalized 2026-09-26 during the mock-isolation migration finalize.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification executed green
