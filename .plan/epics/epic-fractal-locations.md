<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Fractal Locations — Recursive Containment + Mobile Transports

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** locations, hierarchy, transport, travel, world-modeling, recursion
**Source:** `.tmp/fractal-locations-research.md`, `.tmp/fractal-locations-patterns.md`
**Spec:** `docs/spec/locations.md`, `docs/spec/worlds.md`, `docs/spec/exploration-discovery.md`

**Overview:** Extend the existing `locations` table (no fork) with kind/mobility/path/coords and add a transport + route system so a ship can contain sub-locations and travel between ports while actors inside move with it. Includes a new `013_locations_fractal.ts` migration, three new tables (travel_routes, travel_route_stops, actor_locations), five DB triggers (cycle/depth/cross-world/path-set/path-rewrite), a recursive-CTE service layer, a scheduler tick, API endpoints, a recursive location-explorer UI with transport badge, and a comprehensive invariants test suite.

## Summary

Locations in loop-lore today are flat-with-one-FK (`parent_location_id`) and tied to
a single world. There is no concept of a **container location that itself moves
through other locations** (e.g. a ship with internal rooms sailing between ports),
no depth limit or cycle guard, no materialized path, no actor-vs-spatial position
split, and no `kind` discriminator that distinguishes a continent from a tavern
room from a vehicle.

This epic extends the existing `locations` table (no fork) and adds a transport /
route system so that:

- A **ship location** can contain cabins/decks as sub-locations (`parent_location_id`).
- The ship can travel along a **travel route** (port A → port B → port A).
- Actors inside the ship **move with it**; their `physical_location_id` updates
  when the ship docks at a new port, while their `spatial_location_id` (e.g. the
  cabin) stays put.
- NPCs at port see the ship **arrive / depart** as a single event.
- The world can have arbitrarily deep nesting (capped at 12 levels) without
  breaking recursive CTEs or breaking the UI tree.
- Cross-world sub-locations are **rejected** (one world per containment chain).

The design follows the **adjacency-list + materialized-path hybrid** (pattern #12
of the pattern catalog) — cheap reads (`LIKE '/<transport>/%'`), correct writes
(triggers maintain `path` on parent change).

## Why now

The current `connections` JSON column + flat `parent_location_id` cannot express
the canonical "boat with rooms travelling between ports" pattern that the lore
team and the worldbuilder UI keep needing. Without it, GM-authored worlds have to
fake it with one-shot events and ad-hoc chat backgrounds, which breaks the
"fractal" mental model the platform promises.

## Decisions (locked)

| Decision | Value | Rationale |
| -------- | ----- | --------- |
| Depth limit | **12** | User-confirmed; comfortable headroom for "ship inside hangar inside asteroid belt" chains. |
| Cross-world nesting | **Rejected** | User-confirmed; cleaner isolation, no cross-world lore leak. |
| Transport kinds | **`{sea, road, air, custom}`** | User-confirmed; minimal physical + escape hatch. |
| Migration shape | **New top-level `013_locations_fractal.ts`** | Append-only; per `src/db/migrations/README.md`. |
| Hierarchy model | **Adjacency-list + materialized path** | Pattern #12; recursive CTE baseline augmented by trigger-maintained `path` text. |
| Transport movement | **Scheduler-tick advance + route stops** | Cheap; integrates with existing `src/scheduler/` cron pattern. |

## Core systems

1. **Location kind + mobility** — `locations.kind`, `locations.mobility_mode`,
   `locations.coord_*`, `locations.path`.
2. **Travel routes** — `travel_routes`, `travel_route_stops`.
3. **Actor position split** — `actor_locations(actor_id, physical_location_id,
   spatial_location_id, entered_at)`.
4. **Tree integrity** — DB triggers reject self-parent, cycles, cross-world
   parent, depth > 12.
5. **Service layer** — recursive helpers: `getAncestors`, `getDescendants`,
   `getPath`, `getDepth`, `validateNesting`.
6. **Route scheduler** — tick advances `travel_progress`, snaps to stop
   coordinates, fires `transport.arrived` / `transport.departed` events.
7. **UI tree** — recursive walker renders any depth; location-explorer tabs
   by kind; transport badge.

## Tasks

| Task | Ticket | Status |
| ---- | ------ | ------ |
| Migration `013_locations_fractal.ts` (columns + tables + triggers) | `TASK-locations-fractal-migration.md` | ⬜ Not Started |
| Tree integrity validation service (cycle / cross-world / depth) | `TASK-locations-tree-integrity-service.md` | ⬜ Not Started |
| Travel routes + stops CRUD + validation | `TASK-travel-routes-schema-and-crud.md` | ⬜ Not Started |
| Travel scheduler tick (advance progress, snap to stops, fire events) | `TASK-travel-scheduler-tick.md` | ⬜ Not Started |
| Actor position split (`actor_locations` physical vs spatial) | `TASK-actor-position-physical-spatial-split.md` | ⬜ Not Started |
| API routes — nested tree, ancestor/path queries, route CRUD | `TASK-fractal-locations-api-routes.md` | ⬜ Not Started |
| UI tree (location-explorer recursive render + transport badge) | `TASK-location-explorer-recursive-tree.md` | ⬜ Not Started |
| Tests — invariants (cycle / cross-world / depth / rides-parent) | `TASK-fractal-locations-invariants-tests.md` | ⬜ Not Started |

## Out of scope (this epic)

- Phasing (WoW-style content filters per actor).
- Per-instance dungeon copies (WoW instances).
- Planar / dream / portal travel kinds — added later if requested.
- `connections` JSON → typed table conversion — separate epic.
- Player housing (FFXIV-style per-player chamber) — separate epic.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| `locations` table (003_worlds.ts) | `parent_location_id`, `world_id`, `connections` JSON | Extended; not forked. |
| `actors` + `npc_states` (004_actors.ts) | `npc_states.location_id` (flat FK) | `npc_states.location_id` becomes a denormalized cache of `actor_locations.spatial_location_id`. |
| Scheduler (`src/scheduler/`) | cron ticks | Drives `travel_progress` advance. |
| World state (`world_states`) | `weather`, `time_of_day` | `physical_location_id` reads weather; `spatial_location_id` reads room-local state. |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| NPC navigation (`src/rpg/npc-navigation/`) | `physical_location_id` | Pathfinding uses root of containment chain. |
| Chat backgrounds (`src/chat-backgrounds`) | `spatial_location_id` | Per-room background; transport interiors. |
| Travel hazards (`docs/spec/locations.md` §2) | `travel_route_stops` | Hazards per leg of journey. |
| Lore entries (`src/assistant/lore/`) | `getAncestors(id)` | Lore visibility scopes to whole chain, not just one level. |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `LocationKind` | worldbuilder UI, exploration, transport | enum-as-text discriminator |
| `MobilityMode` | transport scheduler, NPC nav | enum-as-text discriminator |
| `TravelRoute` | scheduler, transport UI | routes with stops + dwell time |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `transport.arrived` | emits → Chat, Lore, NPC nav | NPCs at port see ship arrival; chat background syncs. |
| `transport.departed` | emits → Chat, Lore, NPC nav | Symmetric. |
| `transport.position_changed` | emits → Rendering | Coordinate interpolation for UI. |

## Risks & Mitigations

- **Trigger maintenance of `path`** is the gnarliest piece. Mitigation: trigger
  is unit-tested for the four cases (insert, parent update, depth limit,
  cross-world reject) in `src/db/migrations.test.ts`.
- **Recursive CTE performance** on very large worlds. Mitigation: index on
  `path` (`idx_locations_path`) + `LIKE '/<prefix>/%'` queries for subtrees.
- **Migration on existing DBs** with rows already in `locations`. Mitigation:
  default-fill `kind='region'`, `mobility_mode='static'`, `path='/' || id || '/'`
  on every existing row inside the migration's data step.
- **Cross-world rejection** might break an existing imported world with cross-
  world children. Mitigation: `bun run plan:validate` + a one-off migration
  check; if rows exist, log them in `src/db/migrations.test.ts` rather than
  silently failing.

## Related

`docs/spec/locations.md`, `docs/spec/worlds.md`,
`docs/spec/exploration-discovery.md`, `.plan/epics/epic-exploration-discovery.md`,
`.plan/epics/epic-character-core-system.md` (world split),
`.plan/epics/epic-entity-generation-workflows.md` (route generation).

## Research artifacts

- `.tmp/fractal-locations-research.md` — code-grounded map of what exists and
  what's missing (12 gaps, 5 invariants).
- `.tmp/fractal-locations-patterns.md` — 12-pattern catalog with citations +
  concrete `013_locations_fractal.ts` migration sketch.

## Linked Tasks

- `TASK-locations-fractal-migration.md`
- `TASK-locations-tree-integrity-service.md`
- `TASK-travel-routes-schema-and-crud.md`
- `TASK-travel-scheduler-tick.md`
- `TASK-actor-position-physical-spatial-split.md`
- `TASK-fractal-locations-api-routes.md`
- `TASK-location-explorer-recursive-tree.md`
- `TASK-fractal-locations-invariants-tests.md`
