<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# async-store tests use per-test OFFLOAD_DIR + deterministic teardown

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task

**Summary:** Broader fix for the same root cause as `BUG-test-async-store-offload-dir-fixed-path-race.md`: `src/async/spill.ts:12` defines `OFFLOAD_DIR = path.resolve(".tmp", "async-store")` — a fixed, repo-relative path shared by the running app, every test file, and every concurrent test process. Ticket 1 adds an immediate guard; this ticket migrates every `src/async/*test*.ts` file to a unique `OFFLOAD_DIR` per test file under `/tmp/loop-lore-test-<uuid>/` with per-test cleanup (preferable) or `beforeAll`/`afterAll` per-file cleanup (acceptable when per-test ids are already unique, as in `src/async/spill.test.ts`), and adds a runner-level assertion that no async-store test points at `<repo>/.tmp/async-store`.

## Repro / Current state

- All three test files in scope — `src/async/offload.test.ts`, `src/async/offload-daemon.test.ts`, `src/async/spill.test.ts` — import `OFFLOAD_DIR` directly from `./offload` or `./spill` and write fixtures into it (`corrupt.json.gz`, `req-roundtrip.json.gz`, `offload-spill-unit.json.gz`, `offload-spill-twice.json.gz`, `fallback-1.json.gz`, `override-1.json.gz`). Verified via `grep -rln 'corrupt.json.gz\|offload-spill\|req-roundtrip\|fallback-1' src/`.
- `offload.test.ts` already has a `tmpRoot = ".tmp/async-store-test"` `beforeEach/afterEach` block (lines 21-31) but the actual file paths inside the tests join `OFFLOAD_DIR` (lines 42, 56, 60), so `tmpRoot` is dead code. This is the canonical example of the parallel-safety rule being half-implemented.
- Measured leak rate from `.tmp/scratchpad-audit/e2e-matrix2.txt`: +1 file leaked per arm with `E2E_SAFEGUARD` unset; +2 files leaked per arm with `E2E_SAFEGUARD=1`.
**Context:** Filed via giwt template lacking required bold sections; normalized 2026-09-26 during the mock-isolation migration finalize.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification executed green
