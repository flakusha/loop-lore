<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: BDI plan recompute implementation

**Status:** Not Started
**Priority:** high
**Effort:** Medium (production decision fn + governor wiring + tests)
**Summary:** A production `planRecompute` for the BDI reflection cycle, so `runNightlyReflectionCycle` can run outside tests and the scheduler can eventually dispatch it.
**Context:** Split out of `TASK-story-auto-drive-scheduler`, whose dispatch AC required a BDI reflection target. `runNightlyReflectionCycle` (`src/services/agency/bdi-nightly.ts`) is implemented and tested, but its `planRecompute` is a type whose only implementations are test stubs (`src/services/agency/bdi-nightly.test.ts`) plus a "deterministic stub" default noted at `bdi-nightly.ts:32`. Without a real one the cycle cannot run in production. Owned by the decision-layer work in `epic-agency-story-points.md`.

**Acceptance Criteria:**
- [ ] A production `PlanRecomputeFn` exists outside test files and is exported for reuse.
- [ ] It is backed by the existing generation pipeline, not a hardcoded stub.
- [ ] Governor-gated: a scope with no remaining autonomy budget recomputes nothing.
- [ ] `budgetApprove` is wired to the same `AutonomyGovernor` rather than always returning true.
- [ ] Unit tests cover the production recompute, not just injected stubs — including the budget-denied path.
- [ ] `bun run check` green.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, bdi, agency, decision-layer, governor
**Related:** TASK-story-auto-drive-scheduler, epic-agency-story-points, epic-actor-autonomy-story-drive.md:110-121

git issue: b43034d
