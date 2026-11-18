<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fractal Locations API Routes

**Status:** In Progress
**Status Note:** 2026-11-18 reconciliation: 6 of the 14 tabulated endpoints are shipped, plus 5 extra (tree, actor position ×2, attach/detach ×2). This lane does not edit route files; it closes the consumed `LocationTreeService.tree()` payload gap (`src/locations/tree.ts:230-262`). The 8 unshipped endpoints and `transport.position_changed` are carried work, not claimed done; the epic now uses colon-style events (`epic-fractal-locations.md:130-136`).
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** api, rest, locations, routes, transport

**Summary:** Real endpoints live in `src/routes/worlds/fractal-locations-routes.ts`, `src/routes/worlds/fractal-travel-routes.ts` and the pre-existing `src/routes/worlds/locations-routes.ts` — not in `src/routes/worlds/locations.ts` / `src/routes/location-explorer.ts` as the original ticket assumed. All are mounted via `src/routes/worlds/index.ts:33, 37-38`.
**Context:** Nested traversal and transport management are exposed as a new Elysia plugin pair next to the existing flat location CRUD. The shipped set is narrower than the original 14-endpoint table; the missing endpoints stay on the backlog.
**Acceptance Criteria:** See acceptance checklist below.

## Summary (shipped endpoint map)

| Endpoint | Shipped at |
| -------- | ---------- |
| `GET /api/worlds/:worldId/locations/tree` | `src/routes/worlds/fractal-locations-routes.ts:27-48` |
| `POST /api/actors/:actorId/position` | `src/routes/worlds/fractal-locations-routes.ts:49-81` |
| `GET /api/actors/:actorId/position` | `src/routes/worlds/fractal-locations-routes.ts:82-100` |
| `GET` / `POST /api/worlds/:worldId/travel-routes` | `src/routes/worlds/fractal-travel-routes.ts:33-50`, `:51-87` |
| `GET /api/worlds/:worldId/travel-routes/:routeId` | `src/routes/worlds/fractal-travel-routes.ts:88-107` |
| `POST` / `DELETE .../stops[/:stopId]` | `src/routes/worlds/fractal-travel-routes.ts:108-146`, `:147-168` |
| `POST` / `DELETE .../attach/:locId` | `src/routes/worlds/fractal-travel-routes.ts:169-190`, `:191-208` |
| `POST /api/worlds/:worldId/locations/:locId/move` | `src/routes/worlds/locations-routes.ts:135` → `src/routes/worlds/location-tree-move.ts:52-68` → `LocationTreeService.moveSubtree` |
| Existing location CRUD (list/create/get/update/delete) | `src/routes/worlds/locations-routes.ts:26-163` |
| Plugin registration | `src/routes/worlds/index.ts:33, 37-38` (not `src/elysia-app.ts` directly) |

The route files were split to stay under the 250L size-strict gate (`fractal-locations-routes.ts:4-8`, `fractal-travel-routes.ts:4-15`). TypeBox validation is present on every shipped handler, e.g. `fractal-locations-routes.ts:36-47, 69-80, 92-99` and `fractal-travel-routes.ts:42-49, 72-86, 99-106, 130-145, 160-167, 182-189, 200-207`.

## Acceptance Criteria

- [x] Endpoints registered in a scoped plugin — `src/routes/worlds/index.ts:33, 37-38`.
- [ ] `route-ctx-typing` "no `(ctx: any)`" — shipped handlers still use `(ctx: any)` (`fractal-locations-routes.ts:29, 51, 84`; `fractal-travel-routes.ts:35, 53, 90, 110, 149, 171, 193`). Carried; this lane adds no new `(ctx: any)`.
- [x] TypeBox validation (`t`), no `zod` — evidence in the endpoint map above.
- [ ] Every endpoint covered in `*.test.ts` (happy + error) — route-level tests exist for travel routes (`src/routes/worlds/fractal-travel-routes.test.ts:23+`), location CRUD (`locations-routes.test.ts`) and move (`locations-move.test.ts:37+`, `location-tree-move.test.ts`), but there is no `fractal-locations-routes.test.ts` for the tree/position endpoints. Carried.
- [x] `move` goes through the service layer, never direct writes — `src/routes/worlds/location-tree-move.ts:52-68`.
- [ ] `board` / `disembark` service routing — those endpoints do not exist. Carried.
- [x] Tree endpoint payload carries the fixed contract — `LocationTreeService.tree()` selects `path`, `kind`, `mobility_mode`, `current_route_id`, `travel_progress` and derives `depth` from path separators (`src/locations/tree.ts:230-262`); tested `src/locations/tree.test.ts:287-336`. This is the gap this lane closes for the API surface.

## Carried — endpoints and events (not claimed done)

Of the original 14-endpoint table, these 8 are **not shipped**:

- `GET .../locations/:locId/ancestors`
- `GET .../locations/:locId/descendants`
- `GET .../locations/:locId/path`
- `POST .../locations/:locId/board`
- `POST .../locations/:locId/disembark`
- `PATCH /api/worlds/:worldId/travel-routes/:routeId`
- `DELETE /api/worlds/:worldId/travel-routes/:routeId`
- `PATCH .../travel-routes/:routeId/stops/:stopId`

Ancestor/descendant/path queries exist at the service layer (`src/locations/tree.ts:180-224`) but have no HTTP route. Board/disembark have no service method either; only `ActorPositionService.setPosition` / `deriveForTransport` exist (`src/locations/positions.ts:42-82, 151-179`).

Events: the epic's Cross-System Events table now documents colon-style `transport:arrived` / `transport:departed` plus `location:travel` / `location:discovered` (`epic-fractal-locations.md:130-136`). The shipped tick emits colon-form `transport:arrived` / `transport:departed` in `world_event_log` (`src/locations/travel-engine.ts:186-189, 193-212`, tests `:210-271`), matching repo convention. The old dotted names were pre-reconciliation plan text, not a current contract mismatch. `transport.position_changed` is absent — carried, not claimed done.

## Out of Scope

- UI rendering — covered by `TASK-location-explorer-recursive-tree.md`.

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-locations-tree-integrity-service.md`
- `TASK-travel-routes-schema-and-crud.md`
- `TASK-actor-position-physical-spatial-split.md`
