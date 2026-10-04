<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location CRUD + tree service + connection validation hardening

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-locations`
**Related:** `TASK-world-locations.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Close the hardening gaps between the location CRUD routes and the tree
service: route the write path through `LocationTreeService`, stop trusting
client-supplied `path`, add the missing self-link check on create, and expose
`moveSubtree` on a route. Table, triggers, services, and routes all exist —
this is wiring, not greenfield.

## Context

Verified ground state: `locations` table + path triggers
(`src/db/migrations/001_init.ts:509-520`, `:4082-4140`); CRUD handlers
(`src/routes/worlds/locations.ts:80-155` create, `:195-235` update,
`src/routes/worlds/locations-delete.ts:17-42` delete);
`validateConnections` (`src/routes/worlds/location-connections.ts:19-69`);
`LocationTreeService` (`src/locations/tree.ts:54-231` — insert w/ depth limit,
`repairPath`, `moveSubtree` w/ cycle + cross-world rejection);
`TravelRouteService` (`src/locations/routes.ts:44`) +
`TravelTickEngine` (`src/locations/travel-engine.ts:46`).

Gaps (all read, not inferred):

1. `handleUpdateLocation` writes client-supplied `body.path` straight through
   (`locations.ts:212`) — bypasses canonical materialization; only
   `parent_location_id` changes trigger the rewrite.
2. Create-path `validateConnections` (`locations.ts:93-96`) passes no
   `excludeLocationId` — a create payload naming its own (not-yet-known) id
   cannot self-link today only by luck of id timing.
3. `moveSubtree` (`tree.ts:210`) has no route — grep for `moveSubtree` under
   `src/routes/` returns only unrelated NPC-navigation hits; subtree moves
   are service-only.
4. Routes insert/update `locations` directly and never call
   `LocationTreeService.insertLocation` — the depth-limit-12 check
   (`tree.ts:83-86`) fires only for service callers, not HTTP writes.

## Acceptance Criteria

- [ ] Update path rejects or ignores client-supplied `path` (trigger +
  `repairPath` are the sole writers); test pins a forged `path` write
- [ ] Create path validates `connections` against the new row's own id
  (self-link rejected 400, mirroring update-path `:217`)
- [ ] `POST /api/v1/worlds/:worldId/locations/:locId/move` (owner-only)
  delegates to `moveSubtree` with cycle/cross-world errors mapped to 400
- [ ] Route writes go through `LocationTreeService.insertLocation` (or an
equivalent depth check) so HTTP creates respect `LOCATION_DEPTH_LIMIT`
  (`src/db/enums-story/world.ts`); test builds a 12-deep chain via HTTP
  and asserts the 13th is rejected
- [ ] Existing suites green: `locations-crud.test.ts`,
  `locations-routes.test.ts`, `src/locations/tree.test.ts`
