<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Locations query loads all worlds not just current one

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The alive set in src/rpg/world-travel/travel.ts:169 is built from SELECT id, world_id FROM locations with no world_id filter. Every party tick in every world scans the entire locations table. Impact: In a multi-world deployment, this is O(total_locations) per party tick instead of O(world_locations). Fix: Add .where('world_id', '=', worldId) to the locations query at line 169.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
