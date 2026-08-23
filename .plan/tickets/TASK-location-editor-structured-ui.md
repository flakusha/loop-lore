<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-location-editor-structured-ui

**Status**: open
**Priority**: medium
**Labels**: frontend, location-editor, ux, alpine, htmx
**Assignee**:
**Epic**: epic-world-locations
**Related**: `src/routes/worlds/locations.ts`, `src/routes/location-explorer.ts`, `docs/spec/locations.md`

## Description

Locations are managed via API routes (`src/routes/worlds/locations.ts`, `src/routes/location-explorer.ts`) but have no dedicated editor UI. The location explorer (`location-explorer.ts`) is a read-only discovery tool.

**Current state**:
- Location CRUD routes exist but no edit form UI
- `location-explorer.ts` lists locations but doesn't edit them
- NSFW locations have route (`src/routes/nsfw/location.ts`) but no UI

**Spec-defined location properties**:
- Basic: name, description, type (city, dungeon, wilderness, etc.)
- Parent/child hierarchy (world → region → location → sub-location)
- Connected locations (travel routes)
- NSFW: location type, encounter types, content rating
- Traits: character_location_traits (bonus, penalty, effects, equipment_override)
- Story states: location-specific narrative states
- RPG: world-location-traits schemas
- Assets: linked images/gallery for location

### Acceptance Criteria

- [ ] Location editor form: accessible from world editor Locations tab
- [ ] **Basic fields**: name, description, type (enum dropdown), parent location (hierarchical picker)
- [ ] **Traits tab**: trait_name, trait_value, bonus, penalty, effects, equipment_override (same pattern as character traits)
- [ ] **Connections tab**: connected locations list, travel time, travel method, bidirectional toggle
- [ ] **NSFW tab**: location type, encounter types (multi-select), content rating (gated by world validation rules)
- [ ] **Gallery tab**: linked assets/images for location
- [ ] **Story States tab**: narrative states, active/inactive, conditions
- [ ] Location create: from world editor → minimal form → save → redirect to full editor
- [ ] Location list: sortable, filterable, searchable within world editor
- [ ] Breadcrumb navigation: World > Region > Location > Sub-location
- [ ] Unit test: CRUD operations, parent-child hierarchy, trait management

### Notes

- Location routes are under `src/routes/worlds/locations.ts` — extend with edit/view endpoints
- `character_location_traits` table already exists — reuse trait editor pattern
- Location explorer (`location-explorer.ts`) is read-only — keep separate from editor
- NSFW location types from `NsfwLocationType` and `NsfwEncounterType` enums in `src/db/enums.ts`
- Parent-child hierarchy uses `parent_location_id` column
