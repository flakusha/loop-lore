<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: World & Location Template — Full Canonical Model Coverage

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** High
**Type:** Feature Task / Coordination
**Tags:** worlds, locations, config, templates, seeding, schema
**Epic:** epic-world-locations (config-templates sub-area)
**Related:** FEAT-worlds-extension, TASK-worlds-extension, TASK-world-location-encryption,
TASK-wire-world-location-traits-routes, TASK-world-editor-structured-ui,
TASK-location-editor-structured-ui

## Summary

`SeedWorld` (`src/config/schema/seeding.ts`) exposes only 5 fields; `SeedLocation` only 2.
`seedWorlds` (`src/seeding/worlds.ts`) persists just name/description/visibility (+ bare
location name/description). The rich `World`/`Location` specs (`docs/spec/worlds.md`,
`docs/spec/locations.md`) — style, conditions, lore, anomalies, resources, items, npcs,
travel_connections, time_events, discovered/unique, economy, rules — plus the world/location
**traits** services are entirely unreachable via config authoring. No example config file
ships. This task expands the config-template bridge so worlds + locations can be fully defined
in YAML/TOML, mirroring `TASK-char-template-full-model-coverage`.

## Background

Gap analysis (`.tmp/world-location-template-gap-analysis.md`, 2026-08-23) found the spec
models are conceptually on par with BG3/Fallout/RimWorld, but the config authoring layer is
near-absent — a wider gap than characters. Traits services (`world-traits`, `location-traits`)
exist but are not seedable. No existing ticket covers the config bridge.

## Work

1. **Extend `SeedWorld`** to cover the `World` spec:
   - `style`, `conditions`, `lore`, `anomalies[]`, `resources[]`, `npcs[]`,
     `time_tracking`, `travel_system`, `rules`, `economy`, `visibility`
   - nested `locations?: SeedLocation[]` (expanded below)
2. **Extend `SeedLocation`** to cover the `Location` spec:
   - `type`, `style`, `conditions`, `anomalies[]`, `items[]`, `resources[]`, `npcs[]`,
     `storage`, `discovered`, `unique`, `travel_connections[]`, `time_events[]`,
     `parent_location_name` (resolved to FK at seed time)
3. **Extend `seedWorlds`** to persist each new dimension; seed world/location **traits** via
   the existing `world-traits`/`location-traits` services (topological order: worlds →
   locations → traits; resolve `parent_location_name` → id).
4. **Add example config files:** `configs/templates/world.example.yaml` (+ `.toml`) showing
   every new field (characters ship `character.example.yaml`; worlds do not).
5. **Converge** existing tickets — link `FEAT-worlds-extension` / `TASK-worlds-extension`
   (extension features), `TASK-world-location-encryption`, `TASK-wire-world-location-traits-
   routes`, and the editor UI tickets (`TASK-world-editor-structured-ui`,
   `TASK-location-editor-structured-ui`) as consumers of the expanded model. Do not
   re-implement their schemas.

## Acceptance Criteria

- A world defined in YAML can seed: style, conditions, lore, anomalies, resources, npcs,
  time_tracking, travel_system, rules, economy, and child locations with full attributes.
- Locations can seed: type, style, conditions, anomalies, items, resources, npcs, storage,
  discovered/unique, travel_connections, time_events, parent/children.
- World + location **traits** seed via the existing traits services (no orphaned rows).
- `configs/templates/world.example.yaml` (+ toml) demonstrates every new field.
- `seedWorlds` idempotent per (owner, name); re-seed updates rather than duplicates.
- Unit + integration tests for the expanded seeding flow.
- Editor UI tickets reference this task as their config/runtime data source.

## Related Files

- `src/config/schema/seeding.ts`
- `src/seeding/worlds.ts`
- `docs/spec/worlds.md`, `docs/spec/locations.md`
- `src/rpg/world-location-traits/service/{world-traits,location-traits}.ts`
- `configs/templates/` (add world.example.yaml / .toml)

## Notes

- Coordination task, not a schema-redesign. Reuse existing services + spec models.
- `parent_location_name` resolution requires seeding locations before wiring children.
