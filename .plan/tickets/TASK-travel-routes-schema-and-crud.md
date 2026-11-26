<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel Routes Schema + CRUD

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Related:** TASK-travel-routes-schema-crud (duplicate pair)
**Tags:** routes, travel, transport, crud, validation

**Summary:** `TravelRouteService` (`src/locations/routes.ts:45-235`) ships world-scoped route CRUD, ordered stops with dwell + coords, transport attach/detach and progress helpers; cross-world stops are rejected. Schema is in `001_init.ts:4073-4098`. Iterative update/delete and min-stop/endpoint/loop validation were cut deliberately (see Deliberate scope cut).
**Context:** Travel routes are the mechanism for mobile transport movement (a ship sailing between ports). The shipped service is the write surface used by `src/routes/worlds/fractal-travel-routes.ts` and the travel tick.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

`TravelRouteService` (`src/locations/routes.ts:45-235`) is shipped:

| Capability | Location |
| ---------- | -------- |
| `createRoute` (world, kind, waypoints, loop, `secondsPerUnit`) | `routes.ts:48-64` |
| `addStop` — ordered stop + dwell + per-stop coords, cross-world rejected | `routes.ts:71-107` |
| `getStops` / `listStops` — ordered by `stop_order` | `routes.ts:109-116`, `:232-234` |
| `removeStop` — scoped to parent route (cross-world IDOR fix) | `routes.ts:225-230` |
| `getRoute` / `listRoutes` — world-scoped reads | `routes.ts:181-216` |
| `attachTransport` / `detachTransport` — sets / clears `current_route_id` | `routes.ts:123-152` |
| `getRoutesThroughLocation` / `progressToLocation` | `routes.ts:154-179` |

Tests: `src/locations/routes.test.ts`; HTTP endpoints in `src/routes/worlds/fractal-travel-routes.ts` (GET/POST routes, POST/DELETE stops, attach/detach).

## Acceptance Criteria

- [x] Service at `src/locations/routes.ts` (not `src/rpg/travel-routes/`).
- [x] Create / get / list routes, world-scoped (`routes.ts:48-64`, `:181-216`).
- [x] Ordered stops with dwell seconds + per-stop coords (`routes.ts:71-116`).
- [x] Cross-world stop rejection (`routes.ts:79-89`).
- [x] Stop deletion scoped to its route (`routes.ts:225-230`).
- [x] Transport attach / detach updates `locations.current_route_id` (`routes.ts:123-152`).
- [x] Tests in `src/locations/routes.test.ts`.

## Deliberate scope cut

The pre-implementation checklist also named `updateRoute`, `deleteRoute`,
`reorderStops`, `setDwell`, a typed `Result<T, RouteError>` with
`too_few_stops` / `invalid_endpoint` / `loop_mismatch` codes, and min-stop /
endpoint-kind / loop-match validation. None shipped: the service throws plain
`Error` on check failures and leaves iterative route editing to the
world-import path. Recorded here rather than left as an open checkbox — this
lane is not reopening that surface.

## Out of Scope

- The scheduler tick that actually advances `travel_progress` — covered by
  `TASK-travel-scheduler-tick.md`.
- API routes for routes — covered by `TASK-fractal-locations-api-routes.md`.

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-travel-scheduler-tick.md`
- `src/locations/routes.ts` (service implementation)

## Verification Notes (2026-11-18)

- `src/locations/routes.ts` methods enumerated directly: `createRoute` :48, `addStop` :71, `getStops` :109, `attachTransport` :123, `detachTransport` :147, `getRoutesThroughLocation` :154, `progressToLocation` :167, `listRoutes` :181, `getRoute` :194, `removeStop` :225, `listStops` :232. No `updateRoute` / `deleteRoute` / `reorderStops` / `setDwell` / typed `Result`.
- Cross-world stop rejection at :79-89; route-scoped stop delete at :225-230.
- Schema `001_init.ts:4073-4098`; tests `src/locations/routes.test.ts` and `src/routes/worlds/fractal-travel-routes.test.ts`.
