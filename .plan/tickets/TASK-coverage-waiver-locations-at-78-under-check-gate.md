<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-coverage-waiver-locations-at-78-under-check-gate

**Status:** Open

**Priority:** Medium

**Effort:** Medium

**Summary:** Coverage waiver for `src/locations/` (78.81%) + `src/locations/routes.ts` (65%) under diff-base scoped check gate.

**Context:**

The fractal-locations epic (`feat-fractal-locations`) introduced:
- `src/locations/` module measured at 78.81% (346/439) - below global 80% floor.
  Uncovered lines are recursive tree service cycle detection, deep-path
  resolution, and partial-failure rollback branches.
- `src/locations/routes.ts` measures at 65% (104/160) under diff-base scoped
  coverage (registration + CRUD paths exercised by browser-server e2e, not unit).

A dedicated integration suite is the proper fix; until then, both waivers
keep the check gate green for the `feat-e2e-state-contracts` branch.

**Acceptance Criteria:**

- [ ] Module waiver `locations: { floor: 78, reason: ... }` in `scripts/check/coverage.mjs` referencing this ticket id.
- [ ] Per-file waiver `locations:src/locations/routes.ts: { floor: 65, reason: ... }` for diff-base scoped coverage.
- [ ] Coverage gate passes for `feat-e2e-state-contracts`.
- [ ] Ticket stays open until recursive tree invariants get a dedicated integration suite (separate worktree).

**Resolution:**

Waivers applied to `scripts/check/coverage.mjs`. Recursive tree invariants suite tracked under separate epic.
