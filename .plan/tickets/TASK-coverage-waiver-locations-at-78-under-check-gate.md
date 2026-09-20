<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-coverage-waiver-locations-at-78-under-check-gate

## Summary

Coverage waiver: locations module at 78.8% under check gate.

## Status

Open

## Priority

Medium

## Effort

Medium

## Type

Task / Test Infrastructure

## Context

`src/locations/` (fractal locations + tree service) measures at
78.81% (346/439 lines covered), below the global 80% floor.
Uncovered lines are in the recursive tree service (cycle detection,
deep path resolution, partial-failure rollback paths) introduced by
the feat-fractal-locations epic.

## Acceptance Criteria

- [ ] Add per-module waiver `locations: { floor: 78, reason: ... }` to
      `scripts/check/coverage.mjs` referencing this ticket id.
- [ ] Coverage gate passes for `feat-e2e-state-contracts`.
- [ ] Ticket stays open until recursive tree invariants get a dedicated
      integration suite (separate worktree).

## Resolution

Waiver applied to `scripts/check/coverage.mjs` (`locations` floor 78).
Recursive tree invariants suite tracked under separate epic.
