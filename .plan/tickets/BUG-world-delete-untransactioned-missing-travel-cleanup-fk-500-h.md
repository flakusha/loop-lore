<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: World delete untransactioned + missing travel cleanup -> FK 500 half-deleted world

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — handleDeleteWorld (src/routes/worlds/worlds-delete.ts:16-135) is now one `database.transaction()` — any failure rolls the whole teardown back, so no half-deleted world. Added cleanup inside the transaction: travel_route_stops (by the world's route ids) → travel_routes (by world_id) → actor_locations (physical OR spatial in the world's locations), per the ticket's prescription; plus two more no-action FKs the same audit surfaced: locations.parent_location_id released (children are being deleted too; the immediate self-reference would otherwise abort the locations delete) and interaction_logs.location_id/world_id nulled (historical logs survive with bindings released — same policy as the existing chats unlink). All other world_id/location_id references verified against migrations 001/008/040/041/053/059/060/061/063 as cascade or set-null. Tests (src/routes/worlds/worlds-delete.test.ts, 2): travel-route + actor-position world deletes fully (before-evidence: FK constraint failed at worlds-delete.ts:69 locations delete — run 1792912768/2799); nested locations + pinned interaction_logs delete fully with the log surviving and unbound (before-evidence: FK at worlds delete). 2/2 pass. Gates green (run 917135-mvni4io5). Worktree fix/bug-sweep, issue BUG-WORLD-DELETE-UNTRANSACTIONED-MISSING-TRAVEL-CLEANUP-FK-500-H.
**Priority:** high
**Effort:** Medium
**Epic:** epic-world-travel-time

**Summary:**

DELETE world (src/routes/worlds/worlds-delete.ts:25-71) never deletes travel_routes / travel_route_stops / actor_locations (FKs without ON DELETE CASCADE: 001_init.ts:4077,4091,4104-4105) and the teardown is not wrapped in a transaction: with PRAGMA foreign_keys=ON (src/db/index.ts:36) any world with a travel route or actor position FK-500s AFTER npc_states/world_states/quests are already gone - world half-deleted. Fix: delete travel_route_stops -> travel_routes -> actor_locations before locations/worlds, all in one transaction.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): handleDeleteWorld (src/routes/worlds/worlds-delete.ts:16-135) is now one `database.transaction()` — any failure rolls the whole teardown back, so no half-deleted world.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/routes/worlds/worlds-delete.ts:25-71 has no travel_route_stops/travel_routes/actor_locations deletes and no transaction (plain awaits throughout); grep for travel_route|actor_locations|transaction in worktree copies: no matches.

**Resolved:** 2026-10-25 registry-driven close: git issue 74dfbd8 (registry tip: 925503bbd Konstantin Fedotov Close issue)
