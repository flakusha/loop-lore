<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary Catalog Schema And Migration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, ecology, repopulation


Bestiary: Bestiary Catalog Schema And Migration


- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Summary:**
Persist the bestiary catalog (species definition) and the location-population table; both feed every downstream bestiary ticket in this batch.

**Context:**
Existing world-npcs tracking treats NPCs and monsters as a flat actor list. The world-RPG epic batch calls for a distinct bestiary layer: catalog of species (flora / fauna / monster) with behaviour, stats, loot, XP, quest bindings, plus per-location population counts that evolve via time-based repopulation and ecology pressure. This ticket owns schema, migration, and generated types.

**Acceptance Criteria:**
- Migration `NNN_bestiary_catalog` creates tables: `bestiary_entries(id, world_id, category, name, description, behaviour_json, stats_json, loot_table_id, xp_reward, quest_ids_json, habitat_json, generation_json, created_at, updated_at)`, `location_population(location_id, species_id, count, last_death_tick, last_spawn_tick, generation, ecology_pressure, PRIMARY KEY(location_id, species_id))`.
- `category` enum: `flora|fauna|monster`. Validate on insert.
- `behaviour` JSON shape: `{ aggressiveness, intellect, friendliness, diet, schedule, territorial, pack }`.
- FK on `bestiary_entries.world_id -> worlds.id`; FK on `location_population.species_id -> bestiary_entries.id`.
- Generated types + Kysely tables regenerated via `bun run db:sync-types`; `schemas:check` green.
- Roundtrip: insert/select/delete with FK cascade asserts one-to-one vs many-to-one.
- Reuse existing `assertMigrationsNotStale` guard.
