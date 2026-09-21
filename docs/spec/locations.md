<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Locations Specification

> **Status:** Partially implemented — locations, hierarchy, travel, and traits exist; anomalies, resources, storage, and time events are design targets. Authoritative source is `src/` and AGENTS.md.

## Implemented

- `locations` table (`src/db/migrations/001_init.ts` ~L510): world_id, name, description, `connections` JSON, publication_status, `parent_location_id` (sub-locations).
- Services: `src/locations/` — `tree.ts` (hierarchy), `positions.ts` (actor_locations as source of truth; coexists with legacy `npc_states.location_id`), `travel-engine.ts`, `routes.ts`.
- Location/world traits: `/api/rpg/world-location-traits/*` (`src/rpg/world-location-traits/`, `src/routes/rpg/world-location-traits.ts`).
- Location items: `world_items.location_id` (see `docs/spec/items.md`).

## Not implemented / aspirational

- Separate `location_travel_connections` / `location_anomalies` / `location_items` tables (§7) — do not exist; connections are JSON on the row today.
- Anomaly system, location resources/extraction, persistent storage containers, time events.

## Unique content (compressed)

- Spec model — Location{type, style, conditions, anomalies[], items[], resources[], storage, discovered, unique, travel_connections[], time_events[], parent/children}: remains the design target for the missing pieces above.

## Epics

- `.plan/epics/epic-locations.md` (Draft)
- `.plan/epics/epic-world-locations.md`
- `.plan/epics/epic-fractal-locations.md`
- `.plan/epics/epic-exploration-discovery.md`
- `.plan/epics/epic-world-travel-time.md`
