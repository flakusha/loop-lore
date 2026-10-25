<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Travel-route stop DELETE ignores routeId - cross-world IDOR

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-world-travel-time

**Summary:**

removeStop ignores its routeId argument (named _routeId; src/routes/worlds/fractal-travel-routes.ts:147-155) and the route validates only requireWorldOwner(worldId in path) (src/locations/routes.ts:217-219): DELETE /api/worlds/:worldId/travel-routes/:routeId/stops/:stopId deletes ANY travel_route_stops row by id - the owner of world A can delete another user's stops in world B. Fix: delete with .where("route_id","=",routeId) after verifying the route belongs to the path world; 404 otherwise.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): the closure rationale recorded in the Status Note above

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - `removeStop(_routeId, stopId)` ignores routeId and deletes by stop id only (src/locations/routes.ts:217-219); the route only checks requireWorldOwner(worldId) and `_routeId` is never validated (src/routes/worlds/fractal-travel-routes.ts:147-155). Identical in all checked worktrees (the `where("route_id"` hits at :90/:116/:141 are unrelated callsites).

**Resolved:** 2026-10-25 registry-driven close: git issue cc50ef2 (registry tip: 2c543c37d Konstantin Fedotov Close issue)
