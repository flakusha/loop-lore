<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel Routes Schema + CRUD

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** routes, travel, transport, crud, validation

**Summary:** Service layer for travel_routes + travel_route_stops: create/list/update/delete + ordered stop list with dwell per stop. World-scoped; stops in same world. Validates minStops=2, endpoint kinds ∈ {Transit, Region}, loop match. Result-typed errors.
**Context:** Travel routes are the new mechanism for mobile transport movement (e.g. a ship sailing between ports). They are world-scoped and reference locations as stops. Validation prevents malformed routes from reaching the scheduler.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Service layer for `travel_routes` + `travel_route_stops`: create / list /
update / delete a route; manage its ordered stop list with dwell time per
stop. Routes are world-scoped; stops reference `locations.id` (must be in
the same world). Validation: at least 2 stops; first and last stop must
be `LocationKind.Transit` or `LocationKind.Region` (a transport cannot
"dwell" inside a building); loop routes must have first == last stop.

## Acceptance Criteria

- [ ] New file `src/rpg/travel-routes/service.ts`.
- [ ] CRUD: `createRoute`, `getRoute`, `listRoutes(worldId)`,
      `updateRoute`, `deleteRoute` (cascades to stops).
- [ ] Stops: `addStop`, `removeStop`, `reorderStops`, `setDwell`.
- [ ] Validation:
      - `minStops = 2` (route must connect at least two places).
      - `firstStop.kind ∈ {Transit, Region}` and `lastStop.kind ∈ {Transit, Region}`.
      - If `loop=true`, first and last stop IDs must match.
      - All stop `location_id`s must satisfy `location.world_id == route.world_id`.
- [ ] Errors: typed `Result<T, RouteError>` with codes
      `'too_few_stops' | 'invalid_endpoint' | 'cross_world' | 'loop_mismatch'`.
- [ ] Tests in `src/rpg/travel-routes/service.test.ts`:
      - Happy path: create sea route A → B → C.
      - Endpoint rejection (kind = `Room`).
      - Cross-world rejection.
      - Loop mismatch.
      - Delete cascade (stops gone).

## Out of Scope

- The scheduler tick that actually advances `travel_progress` — covered by
  `TASK-travel-scheduler-tick.md`.
- API routes for routes — covered by `TASK-fractal-locations-api-routes.md`.

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-travel-scheduler-tick.md`
