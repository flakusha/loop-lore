<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fractal Locations API Routes

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** api, rest, locations, routes, transport

**Summary:** 14 endpoints across tree traversal (ancestors/descendants/path/move/board/disembark) and route CRUD (list/create/get/patch/delete/stops). route-ctx-typing pattern; TypeBox validation; service-layer routing.
**Context:** Existing API surface (src/routes/worlds/locations.ts, src/routes/location-explorer.ts) does not support nested traversal or transport management. New endpoints expose fractal functionality without rewriting existing routes.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Extend the existing `src/routes/worlds/locations.ts` and
`src/routes/location-explorer.ts` and add new routes for tree traversal,
transport management, and route CRUD. All routes go through Elysia's typed
context pattern (`route-ctx-typing`).

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/worlds/:worldId/locations/:locId/ancestors` | ordered ancestor chain |
| GET | `/api/worlds/:worldId/locations/:locId/descendants` | subtree (optional `?kind=`) |
| GET | `/api/worlds/:worldId/locations/:locId/path` | materialized path string |
| POST | `/api/worlds/:worldId/locations/:locId/move` | change `parent_location_id` (validates via tree integrity service) |
| POST | `/api/worlds/:worldId/locations/:locId/board` | make this transport carry an actor (sets actor_locations.physical) |
| POST | `/api/worlds/:worldId/locations/:locId/disembark` | inverse |
| GET | `/api/worlds/:worldId/travel-routes` | list |
| POST | `/api/worlds/:worldId/travel-routes` | create |
| GET | `/api/worlds/:worldId/travel-routes/:routeId` | detail |
| PATCH | `/api/worlds/:worldId/travel-routes/:routeId` | update |
| DELETE | `/api/worlds/:worldId/travel-routes/:routeId` | delete (cascades) |
| POST | `/api/worlds/:worldId/travel-routes/:routeId/stops` | addStop |
| PATCH | `/api/worlds/:worldId/travel-routes/:routeId/stops/:stopId` | reorder / set dwell |
| DELETE | `/api/worlds/:worldId/travel-routes/:routeId/stops/:stopId` | remove |

## Acceptance Criteria

- [ ] All endpoints registered in `src/elysia-app.ts` (or appropriate
      scoped plugin).
- [ ] `route-ctx-typing` pattern (no `(ctx: any)`).
- [ ] Input validation via Elysia `t` (TypeBox) — no `zod` (per project
      conventions in `AGENTS.md`).
- [ ] Each endpoint covered in `*.test.ts` (happy + 1 error case).
- [ ] `move` and `board`/`disembark` route through the service layer, never
      write directly.

## Out of Scope

- UI rendering — covered by `TASK-location-explorer-recursive-tree.md`.

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-locations-tree-integrity-service.md`
- `TASK-travel-routes-schema-and-crud.md`
- `TASK-actor-position-physical-spatial-split.md`
