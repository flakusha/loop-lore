<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Nightly Heavy Gate + Perf Regression Wiring

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** nightly, ci, heavy-gate, perf-regression
**Epic:** epic-recursive-self-improvement

`.github/workflows/nightly.yml` runs the full `bun run check` + e2e + browser + perf-regression on a nightly cron + on PR label `nightly`. Surfaces results as artifacts.

## Core Features

- `.github/workflows/nightly.yml`:
  - cron: `0 2 * * *` (2am UTC)
  - manual trigger via `workflow_dispatch`
  - PR trigger via label `nightly`
  - runs: typecheck + lint + e2e + browser + perf-regression
  - uploads `.tmp/check-report.json` + `tests/benchmarks/results/`
- Wires `epic-benchmark-ci-regression.md` perf-regression gate into the nightly flow
- Posts summary comment on PRs with the nightly label

## Acceptance Criteria

- [ ] Workflow runs nightly; results visible in Actions tab
- [ ] PR with `nightly` label triggers the workflow
- [ ] Perf-regression thresholds from `epic-benchmark-ci-regression.md` enforced
- [ ] Artifacts uploaded: check report + benchmark results
- [ ] No regression vs `epic-benchmark-ci-regression.md` thresholds

## Files

- `.github/workflows/nightly.yml` — new
- `scripts/check-parallel.mjs` — register `nightly` gate set
- `.github/labeler.yml` — add `nightly` label config (if missing)

## Notes / Verification

- Reuse `tests/benchmarks/` + `scripts/run-benchmarks.ts` from `epic-benchmark-ci-regression.md`.
- Cron timing: 2am UTC avoids peak hours.

