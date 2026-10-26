<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: patrolRoute cast without array validation

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-npc-navigation

**Summary:**

schedule.patrolRoute (src/rpc/npc-navigation/service/processing.ts:151) is cast as string[] without checking Array.isArray. If the schedule JSON contains a non-array truthy value, route.length and route[nextIndex] produce garbage. Impact: Corrupt or hand-edited schedule JSON can teleport NPCs to non-existent locations. Fix: Add Array.isArray(schedule.patrolRoute) ? schedule.patrolRoute : [] instead of the bare cast.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 3d95126 (registry tip: 35c7a15cf Konstantin Fedotov Close issue)
