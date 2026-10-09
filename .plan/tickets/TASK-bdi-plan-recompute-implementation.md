<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: BDI plan recompute implementation

**Status:** Done
**Priority:** high
**Effort:** Medium (production decision fn + governor wiring + tests)
**Summary:** A production `planRecompute` for the BDI reflection cycle, so `runNightlyReflectionCycle` can run outside tests and the scheduler can eventually dispatch it.
**Context:** Split out of `TASK-story-auto-drive-scheduler`, whose dispatch AC required a BDI reflection target. `runNightlyReflectionCycle` (`src/services/agency/bdi-nightly.ts`) is implemented and tested, but its `planRecompute` is a type whose only implementations are test stubs (`src/services/agency/bdi-nightly.test.ts`) plus a "deterministic stub" default noted at `bdi-nightly.ts:32`. Without a real one the cycle cannot run in production. Owned by the decision-layer work in `epic-agency-story-points.md`.

**Acceptance Criteria:**
- [x] A production `PlanRecomputeFn` exists outside test files and is exported for reuse (`createPlanRecompute` in `src/services/agency/bdi-plan-recompute.ts`).
- [x] It is backed by the existing generation pipeline, not a hardcoded stub (`callLlm` via `callLlmGenerator`, with state-derived `fallbackPlan` on parse/generation failure).
- [x] Governor-gated: a scope with no remaining autonomy budget recomputes nothing (the `createBdiDispatch` target charges `per_hour_beat_dispatch` on the world scope; denial reports `bdi_budget`).
- [x] `budgetApprove` is wired to the same `AutonomyGovernor` rather than always returning true (a `peek` against the per-actor cap — the dispatch already paid the world charge, so a second charge would spend hourly budget N times).
- [x] Unit tests cover the production recompute, not just injected stubs — including the budget-denied path (`src/services/agency/bdi-plan-recompute.test.ts`; dispatch gating in `src/autonomy/dispatch/dispatch-targets.test.ts`).
- [x] Scheduler dispatch: `createBdiDispatch` (`src/autonomy/dispatch/bdi-dispatch.ts`) runs the nightly cycle for due actors (no plan row today, `bdi_off_cadence`; no members, `bdi_no_actors`) with the tick-shared-stream jitter draw (`bdi_jitter`, same flip as the movement driver), registered on the production cron tick (`autonomy.world-tick` in `src/cron/jobs.ts`) ahead of movement's governor charge so no beat path is ungoverned; pause/resume/step cover it via the shared `tickWorld` path.
- [x] `bun run check` green (verified by the orchestrator at phase end; per-suite `bun test` green on the touched suites).

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, bdi, agency, decision-layer, governor
**Related:** TASK-story-auto-drive-scheduler, epic-agency-story-points, epic-actor-autonomy-story-drive.md:110-121

git issue: b43034d

**Resolved:** 2026-10-02 registry-driven close: git issue b43034d (registry tip: ee311d3ce Konstantin Fedotov Auto-closed: appended .md marker marks TASK-BDI-PLAN-RECOMPUTE-IMPLEMEN)
