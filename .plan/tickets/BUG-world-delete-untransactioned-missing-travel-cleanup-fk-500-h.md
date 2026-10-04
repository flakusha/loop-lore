<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: World delete untransactioned + missing travel cleanup -> FK 500 half-deleted world

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

DELETE world (src/routes/worlds/worlds-delete.ts:25-71) never deletes travel_routes / travel_route_stops / actor_locations (FKs without ON DELETE CASCADE: 001_init.ts:4077,4091,4104-4105) and the teardown is not wrapped in a transaction: with PRAGMA foreign_keys=ON (src/db/index.ts:36) any world with a travel route or actor position FK-500s AFTER npc_states/world_states/quests are already gone - world half-deleted. Fix: delete travel_route_stops -> travel_routes -> actor_locations before locations/worlds, all in one transaction.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/routes/worlds/worlds-delete.ts:25-71 has no travel_route_stops/travel_routes/actor_locations deletes and no transaction (plain awaits throughout); grep for travel_route|actor_locations|transaction in worktree copies: no matches.
