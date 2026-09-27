<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Smoke Gate — Fast CI Loop

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** smoke, ci, gate, fast
**Epic:** epic-recursive-self-improvement

`bun run smoke` script + `.github/workflows/smoke.yml` — a sub-minute gate that catches obvious breakage before the heavy gate. Runs typecheck + lint + md-lint + 1 representative e2e.

## Core Features

- `scripts/smoke.ts` — runs in series: `bun run typecheck` -> `bun run lint` -> `bun run md:lint` -> `bun test tests/e2e/smoke.test.ts` (1 file)
- Exits non-zero on first failure with a clear summary
- `.github/workflows/smoke.yml`:
  - trigger: push to `dev`, PR to `dev`
  - timeout: 90s
  - uploads `.tmp/smoke-report.json`
- Wired into `scripts/check-parallel.mjs` as a `smoke` gate (lightweight)

## Acceptance Criteria

- [ ] `bun run smoke` completes in <=60s on warm cache, <=90s on cold
- [ ] Workflow runs on every PR; green/red badge visible
- [ ] Failure surfaces in the same `.tmp/check-report.json` schema
- [ ] Replaces or supplements the existing `pr-checks.yml`

## Files

- `scripts/smoke.ts` — new
- `.github/workflows/smoke.yml` — new
- `scripts/check-parallel.mjs` — register `smoke` gate
- `tests/e2e/smoke.test.ts` — new (1 representative test)

## Notes / Verification

- Existing `bun run check` is heavy (10+ min cold). Smoke is the pre-merge cheap version.
- Reuse `scripts/check-parallel.mjs` gate registration; no new gate runner.

