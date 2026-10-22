<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: edgeAhead does not validate location existence

**Status:** Done
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

**Resolved:** 2026-10-22 registry-driven close: git issue 649e9eb (registry tip: 43162eb25 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-EDGEAHEAD-DOES-NOT-VALIDATE-)
