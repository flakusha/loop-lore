<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FIX: Parallelize bun test invocations - isolate pins suite to one core

**Status:** ✅ Resolved (verified 2026-09-18 — all listed changes landed on `dev` HEAD `80b11e372`; ticket left open as bookkeeping)
**Priority:** high
**Effort:** Medium

## Summary

bun 1.4 semantics: --isolate = fresh global per file inside ONE process (no parallelism); --parallel=N = N workers and implies --isolate. Introduced c611d43e6 (2026-07-20, cross-file pollution workaround) + 31978260a + c7557e65f; observed: scoped gates 20-60+ min, giwt finalize SIGTERM exit 143. In-flight tree/fix-check-coverage-jobs fixes only the check gate; this ticket lands the remaining layers: package.json test/test:unit/test:coverage -> --parallel=4 --isolate; delete no-op test:unit:parallel (--concurrency is not a file-parallel flag - probed no-op) + OOM-prone test:parallel; ci script + cicd-pipeline.md reference updates; ci.yml unit job -> --parallel=4. Script names unchanged so npm_lifecycle_event isolation gates keep working.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (verified 2026-09-18)

All described work landed on `dev` (HEAD `80b11e372`) before the regression-recovery audit surfaced this ticket as stale. Verified by repo-wide grep + direct file reads:

| Acceptance criterion | Where it lives | Commit |
|---|---|---|
| `package.json` `test` / `test:unit` / `test:coverage` use `--parallel=${TEST_JOBS:-4} --isolate` | `package.json:63,65,66` | `ddf0bf7cf` + `267c19aa4` |
| Heavy test gates parallelized in `check` runner | `scripts/check-parallel.mjs:387` (`TEST_JOBS` default 4) + `HEAVY_NAMES` block at `:706-708` (coverage serial after lights) | `0a7066954` |
| Slow migration tests skip-by-default in coverage gate (opt-in via `CHECK_INCLUDE_HEAVY_DB_TESTS=1`) | `scripts/check-parallel.mjs:413-426` (`DEFAULT_TEST_SKIP_PATTERNS`) | `963e08c12` + `adc0a0b5d` |
| Opt-in docs in `testing.md` | `docs/spec/testing.md:30-46` | `c1df58835` |
| `ci` script mirrors CI job split (`check:ci && test:unit && test:e2e && build`) | `package.json:117` | pre-existing |
| `.github/workflows/ci.yml` unit job uses `bun test --parallel=4 src/ --isolate` | `ci.yml:75` | pre-existing |
| `docs/spec/cicd-pipeline.md` documents `--parallel=4` | `cicd-pipeline.md:21` | pre-existing |
| No `test:unit:parallel` / `test:parallel` aliases exist (verified by grep: 0 matches) | n/a | n/a |

No-op aliases mentioned in the ticket (`test:unit:parallel`, `test:parallel`) **never shipped** — repo-wide grep returns zero matches. Ticket summary was over-specific on those deletes; the "no-op delete" goal was achieved by never creating them.

### Cross-references

- `TASK-coverage-gate-true-multi-worker-fanout-investigation.md` — sibling ticket covering the migration-test slowness that motivated the skip-by-default mitigation.
- `scripts/check-parallel.gates.test.mjs` — smoke test for the `--gates` / `--skip-gates` selective filter; pass on dev (verified via `bun test scripts/check-parallel.gates.test.mjs`).
