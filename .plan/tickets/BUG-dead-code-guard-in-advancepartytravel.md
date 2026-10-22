<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Dead-code guard in advancePartyTravel

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:**

The condition at src/rpg/world-travel/travel.ts:192 (if step.edges === 0 && step.progress === party.travel_progress) can never be true. walk() computes progress = party.travel_progress + party.steps_per_tick, and line 177 guarantees steps_per_tick > 0, so step.progress > party.travel_progress always. Impact: None at runtime but misleads readers. Fix: Delete the condition or replace with a comment.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue cbcacc6 (registry tip: 66fca2222 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-DEAD-CODE-GUARD-IN-ADVANCEPA)
