<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: patrolRoute cast without array validation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

schedule.patrolRoute (src/rpc/npc-navigation/service/processing.ts:151) is cast as string[] without checking Array.isArray. If the schedule JSON contains a non-array truthy value, route.length and route[nextIndex] produce garbage. Impact: Corrupt or hand-edited schedule JSON can teleport NPCs to non-existent locations. Fix: Add Array.isArray(schedule.patrolRoute) ? schedule.patrolRoute : [] instead of the bare cast.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
