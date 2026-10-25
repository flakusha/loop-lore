<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: World location reparent has no cycle/self/descendant checks - wedges DB

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — reparentLocation (src/routes/worlds/locations-reparent.ts:20, called from src/routes/worlds/locations.ts:222-224) guards all four cases BEFORE the UPDATE: not-found 404, foreign location, self-parent 400 ("location cannot be its own parent"), cross-world 404, descendant-cycle 400 ("move would create a cycle"); pinned in locations-reparent.test.ts:88-136.
**Priority:** critical
**Effort:** Medium
**Epic:** epic-world-locations

**Summary:**

CRITICAL. PUT /worlds/:worldId/locations/:locId reparent (src/routes/worlds/locations.ts:211,232-237) does a raw parent_location_id UPDATE with NO self-parent, cycle/ancestor, or existence/same-world checks. LocationTreeService.moveSubtree implements all of them (src/locations/tree.ts:221-224) but has zero route callers. DB safety nets don't cover it: trg_locations_no_self_parent is BEFORE INSERT only (001_init.ts:4124-4129). A 2-node cycle (A->B then B->A) makes the AFTER UPDATE trigger's UNION ALL recursive CTE (001_init.ts:4177-4182) recurse unboundedly inside the UPDATE - request hangs, SQLite connection wedged, app-wide DB stall until restart. Any world owner can trigger it with two PUTs. Fix: route reparent through LocationTreeService.moveSubtree (or add app-layer self/descendant/cross-world checks before the UPDATE); add HTTP-level regression tests (only service-level moveSubtree tests exist today).

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): reparentLocation (src/routes/worlds/locations-reparent.ts:20, called from src/routes/worlds/locations.ts:222-224) guards all four cases BEFORE the UPDATE: not-found 404, foreign location, self-parent 400 ("location cannot be its own parent"), cross-world 404, descendant-cycle 400 ("move would create a cycle"); pinned in locations-reparent.test.ts:88-136.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev (CRITICAL) - parent_location_id is set from the body via a raw UPDATE with only .where("id") + .where("world_id") (src/routes/worlds/locations.ts:211, 232-237); no self/cycle/existence checks. Same in fix-open-bug-tickets (:118, :211); moveSubtree has zero route callers on dev and in npc-navigation-rescue / feat-actor-autonomy-dispatch.

**Resolved:** 2026-10-25 registry-driven close: git issue 0253416 (registry tip: a156c6b03 Konstantin Fedotov Close issue)
