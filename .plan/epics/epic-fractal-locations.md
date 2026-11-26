<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Fractal Locations — Recursive Containment + Mobile Transports

**Status:** Done
**Status Note:** All eight tasks shipped: schema + 106 integrity triggers, `LocationTreeService`, route CRUD, `locations.tick` events, actor positions, API routes, explorer UI and invariant tests.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** locations, hierarchy, transport, travel, world-modeling, recursion
**Source:** two-part location research pass (code-grounded gap analysis + pattern catalog). Written to `.tmp/` scratch, now deleted — see [Research artifacts](#research-artifacts).
**Spec:** `docs/spec/locations.md`, `docs/spec/worlds.md`, `docs/spec/exploration-discovery.md`

**Overview:** Extends the existing `locations` table (no fork) with kind/mobility/path/coords and a transport + route system so a ship can contain sub-locations and travel between ports while actors inside move with it. Schema shipped in `src/db/migrations/001_init.ts:4004-4184` (three new tables, four triggers) with four more UPDATE/depth triggers in `src/db/migrations/106_locations_integrity.ts:20-71` (`013` is `chat_branches`; `106` is the next append-only number). Cycle + depth stay app-layer. The recursive-CTE service layer, `locations.tick` cron job, API endpoints, recursive explorer UI and invariants tests are in place.

## Summary

The original gap this epic closed: `locations` was flat-with-one-FK
(`parent_location_id`) and tied to a single world, with no movable container
location, no depth/cycle guard, no materialized path, no actor-vs-spatial
position split, and no `kind` discriminator distinguishing a continent from a
tavern room from a vehicle. Those capabilities now ship as described below.

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
| Migration shape | **Schema in `001_init.ts:4004-4184`; new `106_locations_integrity.ts`** | `013` is `chat_branches`; `106` is the next append-only number after `105`. |
| Hierarchy model | **Adjacency-list + materialized path** | Pattern #12; recursive CTE baseline augmented by trigger-maintained `path` text. |
| Transport movement | **Cron `locations.tick` + route stops** | `src/cron/jobs.ts:246-258`, `*/2 * * * *`, `elapsedSeconds: 120`; no `src/scheduler/` dir. |

## Core systems

1. **Location kind + mobility** — `locations.kind`, `locations.mobility_mode`,
   `locations.coord_*`, `locations.path`.
2. **Travel routes** — `travel_routes`, `travel_route_stops`.
3. **Actor position split** — `actor_locations(actor_id, physical_location_id,
   spatial_location_id, entered_at)`.
4. **Tree integrity** — four INSERT/UPDATE triggers in `001_init.ts:4121-4184`
   reject self-parent + cross-world parents and maintain `path`; four more
   UPDATE/depth triggers ship in `106_locations_integrity.ts:20-71`. Cycle and
   the depth-12 ceiling are app-layer (`LocationTreeService`, `LOCATION_DEPTH_LIMIT`).
5. **Service layer** — `LocationTreeService` in `src/locations/tree.ts:77-300`:
   `getAncestors`, `getDescendants`, `repairPath`, `insertLocation`, `moveSubtree`,
   `tree` (recursive CTE where applicable; real path/depth/transport fields).
6. **Route scheduler** — tick advances `travel_progress`, snaps to stop
   coordinates, propagates riders, and appends `transport:arrived` /
   `transport:departed` events to `world_event_log` (colon-style).
7. **UI tree** — recursive walker renders any depth; location-explorer tabs
   by kind; transport badge.

## Tasks

| Task | Ticket | Status |
| ---- | ------ | ------ |
| Migration (`001_init.ts:4004-4184` + `106_locations_integrity.ts`) | `TASK-locations-fractal-migration.md` | ✅ Done |
| Tree integrity validation service (`src/locations/tree.ts`) | `TASK-locations-tree-integrity-service.md` | ✅ Done |
| Travel routes + stops CRUD | `TASK-travel-routes-schema-and-crud.md` | ✅ Done |
| Travel scheduler tick (`locations.tick`, events) | `TASK-travel-scheduler-tick.md` | ✅ Done |
| Actor position split (`src/locations/positions.ts`) | `TASK-actor-position-physical-spatial-split.md` | ✅ Done |
| API routes (`src/routes/worlds/fractal-*-routes.ts`) | `TASK-fractal-locations-api-routes.md` | ✅ Done |
| UI tree (`src/frontend/alpine/location-explorer.ts`) | `TASK-location-explorer-recursive-tree.md` | ✅ Done |
| Tests — invariants (`src/db/locations-fractal-invariants.test.ts`) | `TASK-fractal-locations-invariants-tests.md` | ✅ Done |

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
| Cron catalog (`src/cron/jobs.ts:246-258`) | `locations.tick` job (`*/2`, `elapsedSeconds: 120`) | Drives `travel_progress` advance; no `src/scheduler/` dir. |
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
| `transport:arrived` (`travel-engine.ts:186`) | emits → `world_event_log`, riders | NPCs at port see ship arrival; rider spatial positions update. |
| `transport:departed` (`travel-engine.ts:188`) | emits → `world_event_log` | Emitted on loop wrap only. |
| `location:travel` / `location:discovered` (`edge-discovery.ts:131`) | emits → `world_event_log` | Existing colon-style world events; repo never uses dot-style names. |

## Risks & Mitigations

- **Trigger maintenance of `path`** is the gnarliest piece. Mitigation:
  the four shipped INSERT/UPDATE triggers in `001_init.ts:4121-4184` are
  covered by `src/db/locations-fractal-invariants.test.ts`; four more
  UPDATE/depth triggers ship in `106_locations_integrity.ts:20-71`. Depth and cycle
  are app-layer (`LocationTreeService`), not triggers in `001_init.ts`.
- **Recursive CTE performance** on very large worlds. Mitigation: index on
  `path` (`idx_locations_path`) + `LIKE '/<prefix>/%'` queries for subtrees.
- **Migration on existing DBs** with rows already in `locations`. Mitigation:
  columns carry SQL defaults (`kind='region'`, `mobility_mode='static'`),
  and `trg_locations_set_path_on_insert` materializes `path` — there is no
  separate backfill data step to re-run.
- **Cross-world rejection** might break an existing imported world with cross-
  world children. Mitigation: `bun run plan:validate` + the invariant tests
  in `src/db/locations-fractal-invariants.test.ts`.

## Related

`docs/spec/locations.md`, `docs/spec/worlds.md`,
`docs/spec/exploration-discovery.md`, `.plan/epics/epic-exploration-discovery.md`,
`.plan/epics/epic-character-core-system.md` (world split),
`.plan/epics/epic-entity-generation-workflows.md` (route generation).

## Research artifacts

Both research docs were written to `.tmp/` scratch and have since been deleted
(`AGENTS.md` §Scratchpad: ".tmp/ is auto-ignored by git; delete before merge").
Neither can be opened — do not go looking for them.

- *fractal-locations-research* — code-grounded map of what exists and what's
  missing (12 gaps, 5 invariants).
- *fractal-locations-patterns* — 12-pattern catalog with citations + a
  migration sketch (schema now lives in `001_init.ts`, integrity guards in
  `106_locations_integrity.ts`; `013` is `chat_branches`).

The distilled content of both survives in this epic: the gaps and invariants
are the Core systems list and the locked Decisions table, and pattern #12 (the
adjacency-list + materialized-path hybrid) is the locked Hierarchy-model
decision. **Re-derive before implementing** by reading `docs/spec/locations.md`,
`docs/spec/worlds.md`, `src/db/migrations/` and `src/rpg/npc-navigation/`
against the Tasks table — the Tasks table, not the deleted audit, is the
authority on what was built.

## Linked Tasks

- `TASK-locations-fractal-migration.md`
- `TASK-locations-tree-integrity-service.md`
- `TASK-travel-routes-schema-and-crud.md`
- `TASK-travel-scheduler-tick.md`
- `TASK-actor-position-physical-spatial-split.md`
- `TASK-fractal-locations-api-routes.md`
- `TASK-location-explorer-recursive-tree.md`
- `TASK-fractal-locations-invariants-tests.md`

## Verification Notes (2026-11-18)

- Schema: `src/db/migrations/001_init.ts:4004-4184` (columns :4004-4044, indexes :4046-4071, tables :4073-4119, four triggers :4121-4184).
- Integrity: `src/db/migrations/106_locations_integrity.ts:20-71` (four triggers) + `src/db/locations-fractal-invariants.test.ts:44-47,290`.
- Services: `src/locations/tree.ts:77-300` (`tree()` :230-262), `routes.ts:45-235`, `travel-engine.ts:46-215`, `positions.ts:31-160`.
- Cron: `src/cron/jobs.ts:246-258` (`locations.tick`, `*/2`, `elapsedSeconds: 120`).
- Named tests: `src/locations/{tree,routes,travel-engine,positions}.test.ts`, `src/db/locations-fractal-invariants.test.ts`, `src/routes/worlds/fractal-travel-routes.test.ts`.
