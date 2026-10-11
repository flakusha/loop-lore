<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Dead-code guard in advancePartyTravel

**Status:** Not Started
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
