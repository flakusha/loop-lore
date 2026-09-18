<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Decide whether test files need plan owners

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Small
**Related:** TASK-plan-phantom-src-citation-guard.md

## Summary

Decide once whether test files require code-map owners, then encode the decision so the uncovered set stops being noise.

## Context

Real `src/` files with no code-map owner concentrate in test files plus a few newer modules (middleware, cron, federation, memory). Either tests are ownerless by design — then teach `plan:map` to skip them — or they need owners, in which case backfill the substantive modules. Both readings are defensible; the current middle (untracked, unowned) helps nobody. Relevant tooling: `scripts/plan-code-map.ts`.

## Acceptance Criteria

- [ ] Policy recorded (skip-by-design or backfill)
- [ ] Implemented: skip rule in the generator, or owners backfilled
- [ ] Remaining uncovered set is policy-compliant by construction
