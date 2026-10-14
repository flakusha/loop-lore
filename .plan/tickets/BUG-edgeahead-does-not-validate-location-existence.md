<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: edgeAhead does not validate location existence

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

edgeAhead (src/rpg/world-discovery/trade.ts:152-157) parses the route and returns route[routeIndex + 1] without checking that the location still exists. Impact: Trade events reference non-existent locations. Fix: Accept an alive: Set`<string>` parameter and filter.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
