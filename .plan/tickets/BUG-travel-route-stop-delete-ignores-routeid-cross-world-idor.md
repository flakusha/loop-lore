<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Travel-route stop DELETE ignores routeId - cross-world IDOR

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — removeStop now scopes the DELETE to the route (`.where("route_id", "=", routeId)`, src/locations/routes.ts:225-233) and DELETE /api/v1/worlds/:worldId/travel-routes/:routeId/stops/:stopId 404s when the route does not resolve under the path world (src/routes/worlds/fractal-travel-routes.ts:153-158); regressions in src/locations/travel-engine.test.ts describe "TravelRouteService.removeStop scoping" (6/6 pass on the fix; note stop ids are travel_route_stops row ids returned by addStop, not location ids). BEFORE-EVIDENCE (observed 2026-10-25 by swapping in the parent-commit file 6621f744a^ via .tmp/travel-probe.ts and restoring byte-identically): 5 pass / 1 fail — exactly "refuses to delete another route's stop by bare id" fails against the old unscoped delete. Neighbors green: travel-engine + related suites. Gates: typecheck + eslint green on final HEAD (run 666566-mvnfwjhq), worktree fix/bug-sweep, issue BUG-TRAVEL-ROUTE-STOP-DELETE-IGNORES-ROUTEID-CROSS-WORLD-IDOR.
**Priority:** high
**Effort:** Medium
**Epic:** epic-world-travel-time

**Summary:**

removeStop ignores its routeId argument (named _routeId; src/routes/worlds/fractal-travel-routes.ts:147-155) and the route validates only requireWorldOwner(worldId in path) (src/locations/routes.ts:217-219): DELETE /api/worlds/:worldId/travel-routes/:routeId/stops/:stopId deletes ANY travel_route_stops row by id - the owner of world A can delete another user's stops in world B. Fix: delete with .where("route_id","=",routeId) after verifying the route belongs to the path world; 404 otherwise.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): removeStop now scopes the DELETE to the route (`.where("route_id", "=", routeId)`, src/locations/routes.ts:225-233) and DELETE /api/v1/worlds/:worldId/travel-routes/:routeId/stops/:stopId 404s when the route does not resolve under the path world (src/routes/worlds/fractal-travel-routes.ts:153-158); regressions in src/locations/travel-engine.test.ts describe "TravelRouteService.removeStop scoping" (6/6 pass on the fix; note stop ids are travel_route_stops row ids returned by addStop, not location ids).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - `removeStop(_routeId, stopId)` ignores routeId and deletes by stop id only (src/locations/routes.ts:217-219); the route only checks requireWorldOwner(worldId) and `_routeId` is never validated (src/routes/worlds/fractal-travel-routes.ts:147-155). Identical in all checked worktrees (the `where("route_id"` hits at :90/:116/:141 are unrelated callsites).

**Resolved:** 2026-10-25 registry-driven close: git issue cc50ef2 (registry tip: 2c543c37d Konstantin Fedotov Close issue)
