<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fractal Locations Migration (`001_init.ts` + `106_locations_integrity.ts`)

**Status:** Done
**Priority:** high
**Effort:** High
**Epic:** epic-fractal-locations
**Duplicate of:** TASK-fractal-locations-migration-013-locations-fractal-ts (kept — git-issue parity; status mirrored 2026-10-23)
**Tags:** locations, schema, migration, transport, tree

**Summary:** Schema shipped in `src/db/migrations/001_init.ts:4004-4184` (kind/mobility/path/coords/current_route_id/travel_progress columns, indexes, `travel_routes` / `travel_route_stops` / `actor_locations`, four triggers); `src/db/migrations/106_locations_integrity.ts:20-71` adds four UPDATE/depth triggers. Cycle + depth stay app-layer. 013 is `chat_branches`; 106 is the next append-only number.
**Context:** The fractal columns and transport tables live in the initial schema, so every downstream ticket has its foundation. This ticket is complete: the INSERT-time guards, the UPDATE/depth triggers and their invariant tests are all in place.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

The fractal-locations schema was folded into the initial migration rather than
shipped as a standalone `013_*` file. `013` is taken by `013_chat_branches.ts`;
the next append-only number is `106` (after `105_harness_queue_owner.ts`), so
the new integrity migration is `106_locations_integrity.ts`. There is no
`recordSchemaVersion(db, 34, …)` step and no `src/db/migrations/parts/`
directory — both were pre-implementation assumptions, now void.

Shipped in `src/db/migrations/001_init.ts`:

| Object | Location |
| ------ | -------- |
| `locations.kind` / `.mobility_mode` / `.path` | `001_init.ts:4004-4019` |
| `locations.coord_x/y/z`, `.current_route_id`, `.travel_progress` | `001_init.ts:4021-4044` |
| `idx_locations_path`, `idx_locations_kind`, `idx_locations_current_route`, `uq_locations_world_path` | `001_init.ts:4046-4071` |
| `travel_routes` (incl. `seconds_per_unit`) | `001_init.ts:4073-4084` |
| `travel_route_stops` (ordered, per-stop coords) | `001_init.ts:4086-4098` |
| `actor_locations` + physical/spatial indexes | `001_init.ts:4100-4119` |
| Four triggers (see below) | `001_init.ts:4121-4184` |

Enums and the depth constant live in `src/db/enums-story/world.ts:110-168`:
`LocationKind` (:121), `MobilityMode` (:139), `TransportKind` (:154),
`LOCATION_DEPTH_LIMIT = 12` (:168).

## Trigger split (corrected count)

The original plan called for five SQLite triggers. Shipped reality is four in
`001_init.ts` plus four more in `106_locations_integrity.ts` (eight total).
Depth and cycle are deliberately not trigger-enforced in `001_init.ts`
(SQLite triggers cannot express the recursive walk):

1. `trg_locations_no_self_parent` — BEFORE INSERT (`001_init.ts:4124`).
2. `trg_locations_cross_world_parent` — BEFORE INSERT (`001_init.ts:4138`).
3. `trg_locations_set_path_on_insert` — AFTER INSERT (`001_init.ts:4148`).
4. `trg_locations_set_path_on_update` — AFTER UPDATE OF parent_location_id,
   rewrites every descendant path (`001_init.ts:4161`).

Depth ceiling (`insertLocation`) and cycle rejection (`moveSubtree`) are
app-layer in `LocationTreeService` (`src/locations/tree.ts:113-146`,
`:270-299`). `106_locations_integrity.ts` ships **four new** triggers —
`trg_locations_no_self_parent_on_update` (:20),
`trg_locations_cross_world_parent_on_update` (:30),
`trg_locations_depth_limit_on_insert` (:45) and
`trg_locations_depth_limit_on_update` (:56) — closing the UPDATE/depth gap
left by the four INSERT-time guards. `down()` drops exactly these four
(:68-71); coverage is in `src/db/locations-fractal-invariants.test.ts:44-47`,
`:290`.

## Decisions (locked from epic)

- Depth limit: **12** (app-layer `LOCATION_DEPTH_LIMIT`, mirrored by the new
  depth triggers).
- Cross-world parent: **rejected** (trigger on INSERT and UPDATE, service on
  move).
- Transport kinds: **`{sea, road, air, custom}`** (`TransportKind`).

## Acceptance Criteria

- [x] Fractal columns on `locations` (`kind`, `mobility_mode`, `path`,
      `coord_x/y/z`, `current_route_id`, `travel_progress`) — `001_init.ts:4004-4044`.
- [x] Indexes `idx_locations_path`, `idx_locations_kind`,
      `idx_locations_current_route`, unique `uq_locations_world_path` —
      `001_init.ts:4046-4071`.
- [x] `travel_routes` / `travel_route_stops` / `actor_locations` tables —
      `001_init.ts:4073-4119`.
- [x] Four shipped triggers (self-parent, cross-world, path-on-insert,
      path-on-update) — `001_init.ts:4121-4184`.
- [x] `LocationKind`, `MobilityMode`, `TransportKind`, `LOCATION_DEPTH_LIMIT`
      — `src/db/enums-story/world.ts:110-168`.
- [x] Depth + cycle app-layer enforcement — `src/locations/tree.ts:113-146`,
      `:270-299`.
- [x] Append-only `src/db/migrations/106_locations_integrity.ts:20-71` adds
      the four UPDATE/depth triggers above. 013 is `chat_branches`; 106 is
      the next free number.
- [x] Invariant coverage for the new triggers —
      `src/db/locations-fractal-invariants.test.ts:44-47`, `:290`.

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
- `src/db/migrations/001_init.ts` (schema lives here, not in a `parts/` file)
- `src/db/migrations/013_chat_branches.ts` (013 is taken)
- `src/db/migrations/README.md` (append-only policy)

## Verification Notes (2026-11-18)

- `001_init.ts:4004-4184` read directly: one-column-per-ALTER additions, four indexes, three tables, four triggers (:4124, :4138, :4148, :4161).
- `106_locations_integrity.ts:20,30,45,56` creates the four UPDATE/depth triggers; `:68-71` drops exactly those four.
- `src/db/locations-fractal-invariants.test.ts:44-47,290` asserts trigger names and the up/down roundtrip (test `migration 106: up creates and down removes exactly its triggers`).
- `src/db/enums-story/world.ts:121,139,154,168` carries the three enums and `LOCATION_DEPTH_LIMIT = 12`; app-layer guards at `src/locations/tree.ts:113-146,270-299`.
