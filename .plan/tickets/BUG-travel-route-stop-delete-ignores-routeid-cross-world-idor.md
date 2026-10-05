<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Travel-route stop DELETE ignores routeId - cross-world IDOR

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

removeStop ignores its routeId argument (named _routeId; src/routes/worlds/fractal-travel-routes.ts:147-155) and the route validates only requireWorldOwner(worldId in path) (src/locations/routes.ts:217-219): DELETE /api/worlds/:worldId/travel-routes/:routeId/stops/:stopId deletes ANY travel_route_stops row by id - the owner of world A can delete another user's stops in world B. Fix: delete with .where("route_id","=",routeId) after verifying the route belongs to the path world; 404 otherwise.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - `removeStop(_routeId, stopId)` ignores routeId and deletes by stop id only (src/locations/routes.ts:217-219); the route only checks requireWorldOwner(worldId) and `_routeId` is never validated (src/routes/worlds/fractal-travel-routes.ts:147-155). Identical in all checked worktrees (the `where("route_id"` hits at :90/:116/:141 are unrelated callsites).
