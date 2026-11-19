<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Smoke Gate — Fast CI Loop

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Done
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** smoke, ci, gate, fast
**Epic:** epic-recursive-self-improvement

`bun run smoke` + `.github/workflows/smoke.yml` — a sub-minute gate that catches obvious breakage before the heavy gate. Reuses the parallel gate runner with a small gate set: backend/bun/frontend/scripts typechecks, ESLint, md-lint, and one in-memory app boot + health probe (`smoke - app`).

## Core Features

- `package.json` `smoke` selects seven existing gates through `check:parallel`; no new runner and no duplicated gate logic.
- `gate-table.mjs` registers `smoke - app` → `bun run smoke:app`. The app smoke now exits non-zero on a failed health probe and runs with `NODE_ENV=development` because it boots an in-memory DB with auth disabled.
- `.github/workflows/smoke.yml` triggers on push and PR to `dev`, uses the smallest whole-minute job timeout, and uploads `.tmp/check-report.json` on every run.

## Acceptance Criteria

- [x] `bun run smoke` completes inside the 60s warm-cache budget (7/7 gates pass locally; timing recorded in the lane evidence).
- [ ] Workflow runs on every PR; badge visible after landing (workflow added; CI execution not observable in this lane).
- [x] Failure surfaces in the same `.tmp/check-report.json` schema (the gate runner writes it; a failing run was observed before the smoke-app fix).
- [x] Supplements the existing `pr-checks.yml` rather than replacing it.

**Status note:** landed on branch `rsi-smoke-gate`, not finalized; ticket index reconciliation is post-merge.

## Files

- `package.json` — `smoke` and fail-closed `smoke:app` scripts.
- `scripts/check/parallel/gate-table.mjs` — `smoke - app` gate registration.
- `src/scripts/smoke-app.ts` — fail-closed probe exit + dev-mode config.
- `.github/workflows/smoke.yml` — new PR/push trigger.

## Notes / Verification

- Existing `bun run check` is heavy (10+ min cold). Smoke is the pre-merge cheap version.
- Reuse `scripts/check-parallel.mjs` gate registration; no new gate runner.

