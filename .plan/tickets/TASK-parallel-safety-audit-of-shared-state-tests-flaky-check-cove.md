<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: parallel-safety audit of shared-state tests (flaky-check covers sleeps/timeouts only; suite documented serial-only)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Parallel-safety audit of shared-state tests. The flaky-check probe only covers sleeps/timeouts; cross-file contamination via the shared module registry is documented but the suite's parallel safety is unassessed.

**Files:**

- .tmp/reviews/2026-10-25/evidence/flaky-check.txt (grep-level only, sleeps/timeouts)
- AGENTS.md:23 (documents `bun test src/` as serial-only for reproducing cross-file contamination via the shared module registry)
- package.json:55 (`bun run test:unit` defaults to `--parallel=4 --isolate`)
- docs/meta/research/finalize-speedup.md:300 (parallel unit tests recorded as not yet proven safe)
- scripts/check/parallel/runner.mjs (check runner serializes heavy test gates instead)

**Evidence:**

- README/gates: "no sleeps/timeouts in touched tests — grep-level only, parallel-safety NOT assessed (evidence/flaky-check.txt)"; AGENTS.md:23 documents `bun test src/` as serial-only for reproducing cross-file contamination via the shared module registry, while `bun run test:unit` defaults to `--parallel=4 --isolate` (package.json:55) and docs/meta/research/finalize-speedup.md:300 records parallel unit tests as not yet proven safe — the check runner serializes heavy test gates instead (scripts/check/parallel/runner.mjs).

**Fix:**

Audit shared-state/mutation-prone test files for module-scope state (registries, singletons, mock.module leakage) under `--parallel=4 --isolate`; either prove parallel-safe, fix offending files (isolate-only convention), or document/enforce the constraint where the tooling runs tests.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — README.md (T-6) + gates.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
