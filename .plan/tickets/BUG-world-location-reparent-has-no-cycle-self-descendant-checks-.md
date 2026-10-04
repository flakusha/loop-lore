<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: World location reparent has no cycle/self/descendant checks - wedges DB

**Status:** Not Started
**Priority:** critical
**Effort:** Medium

**Summary:**

CRITICAL. PUT /worlds/:worldId/locations/:locId reparent (src/routes/worlds/locations.ts:211,232-237) does a raw parent_location_id UPDATE with NO self-parent, cycle/ancestor, or existence/same-world checks. LocationTreeService.moveSubtree implements all of them (src/locations/tree.ts:221-224) but has zero route callers. DB safety nets don't cover it: trg_locations_no_self_parent is BEFORE INSERT only (001_init.ts:4124-4129). A 2-node cycle (A->B then B->A) makes the AFTER UPDATE trigger's UNION ALL recursive CTE (001_init.ts:4177-4182) recurse unboundedly inside the UPDATE - request hangs, SQLite connection wedged, app-wide DB stall until restart. Any world owner can trigger it with two PUTs. Fix: route reparent through LocationTreeService.moveSubtree (or add app-layer self/descendant/cross-world checks before the UPDATE); add HTTP-level regression tests (only service-level moveSubtree tests exist today).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
