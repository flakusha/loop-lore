<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fractal Locations Migration (`013_locations_fractal.ts`)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** High
**Epic:** epic-fractal-locations
**Tags:** locations, schema, migration, transport, tree

**Summary:** Append-only Kysely migration extending locations with kind/mobility_mode/path/coord_*/current_route_id/travel_progress; creates travel_routes, travel_route_stops, actor_locations tables and five SQLite triggers (cycle, depth ≤ 12, cross-world reject, path-set on insert, path-rewrite on parent update).
**Context:** The current locations table has only parent_location_id (no depth guard, no cycle guard, no cross-world guard, no kind discriminator, no movement). This migration is the foundation of the fractal-locations epic — every other ticket depends on these columns/triggers existing.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Append-only Kysely migration `src/db/migrations/013_locations_fractal.ts`. Adds
fractal / recursive / mobile-transport support to the existing `locations`
table plus three new tables (`travel_routes`, `travel_route_stops`,
`actor_locations`) and five SQLite triggers (cycle guard, depth guard,
cross-world guard, `path` maintenance on insert, `path` rewrite on
parent update). Existing rows default to `kind='region'`, `mobility_mode='static'`,
`path='/' || id || '/'`, all coordinates NULL.

## Decisions (locked from epic)

- Depth limit: **12**.
- Cross-world parent: **rejected**.
- Transport kinds: **`{sea, road, air, custom}`**.

## Acceptance Criteria

- [ ] New top-level file `src/db/migrations/013_locations_fractal.ts`
      exports `up(db)` and `down(db)`.
- [ ] `up()` calls `recordSchemaVersion(db, 34, "locations fractal: kind/mobility/path/coords, transport_routes, actor_locations")` from `src/db/schema-version.ts` (next global schema version after 33 used by `012_asset_thumbnail.ts` / `012_avatar_focus.ts`).
- [ ] `locations` extended with: `kind`, `mobility_mode`, `path`, `coord_x`,
      `coord_y`, `coord_z`, `current_route_id`, `travel_progress`. All
      `ALTER TABLE` statements use **one column per statement** (SQLite
      limitation — per `src/db/migrations/README.md`).
- [ ] New indexes: `idx_locations_path`, `idx_locations_kind`. Unique
      constraint `uq_locations_world_path` on `(world_id, path)`.
- [ ] `travel_routes` table created (id, world_id, name, kind, waypoints
      JSON, loop, created_at).
- [ ] `travel_route_stops` table created (id, route_id FK, location_id FK,
      dwell_seconds, stop_order, unique `(route_id, stop_order)`).
- [ ] `actor_locations` table created (actor_id PK + FK actors.id cascade,
      physical_location_id FK locations.id restrict, spatial_location_id FK
      locations.id restrict, entered_at).
- [ ] Five triggers:
      1. `trg_locations_no_self_parent` — reject `parent_location_id = id`.
      2. `trg_locations_depth_limit` — reject when path has > 12 `/`.
      3. `trg_locations_cross_world_parent` — reject when
         `child.world_id <> parent.world_id`.
      4. `trg_locations_set_path` — on insert, if `parent_location_id IS
         NULL` set `path = '/' || id || '/'`.
      5. `trg_locations_set_path_on_update` — on `UPDATE OF
         parent_location_id`, rewrite `path` for the row + every descendant.
- [ ] Data backfill step in `up()`: walk existing locations, set
      `kind='region'`, `mobility_mode='static'`, `path='/' || id || '/'`.
      (Bun migration runs in a transaction; backfill is idempotent.)
- [ ] `down()` drops every new object in reverse order.
- [ ] `bun run db:sync-types && bun run db:sync-manifest` regenerated.
- [ ] `bun run schemas:check` passes.
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`
      passes (roundtrip up → down → up produces same schema + data state).
- [ ] New column-types mapping added to `src/db/column-types.ts` for
      `LocationKind` and `MobilityMode` so generated schemas get typed unions.
- [ ] `src/db/enums-story/world.ts` extended with `LocationKind`,
      `MobilityMode`, `TransportKind` (per spec section in the research).

## Out of Scope

- Service layer / business logic — covered by
  `TASK-locations-tree-integrity-service.md`.
- API routes — covered by `TASK-fractal-locations-api-routes.md`.
- UI tree — covered by `TASK-location-explorer-recursive-tree.md`.
- Tests for invariants — covered by
  `TASK-fractal-locations-invariants-tests.md`.

## Related

- `epic-fractal-locations.md`
- `TASK-locations-tree-integrity-service.md`
- `src/db/migrations/parts/003_worlds.ts` (existing schema to extend)
- `src/db/migrations/README.md` (append-only policy)
