<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Locations query loads all worlds not just current one

**Status:** Done
**Status Note:** 2026-10-26 sweep-B code verify: src/rpg/world-travel/travel.ts:170 now filters locations by world_id as prescribed. Findings: .tmp/reviews/2026-10-26-sweep-B/BUG-locations-query-loads-all-worlds-not-just-current-one.md
**Priority:** medium
**Effort:** Medium
**Epic:** epic-locations

**Summary:**

The alive set in src/rpg/world-travel/travel.ts:169 is built from SELECT id, world_id FROM locations with no world_id filter. Every party tick in every world scans the entire locations table. Impact: In a multi-world deployment, this is O(total_locations) per party tick instead of O(world_locations). Fix: Add .where('world_id', '=', worldId) to the locations query at line 169.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue c1c56b0 (registry tip: ba0507fb5 Konstantin Fedotov Close issue)
