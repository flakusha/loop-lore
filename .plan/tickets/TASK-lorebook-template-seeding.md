<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Lorebook Template Seeding (Character + World Config)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Task / Coordination
**Tags:** lorebook, config, templates, seeding, characters, worlds
**Epic:** epic-character-core-system / epic-world-locations (cross-cutting)
**Related:** TASK-char-template-full-model-coverage, TASK-world-template-full-model-coverage,
TASK-lorebook-export, TASK-character-spec-adopt-sillytavern-extensions

## Summary

Lorebook is a first-class, cross-cutting entity (`actor_lore_entries` for characters,
`world_lore_entries` for worlds) with advanced runtime features (cooldowns, activation,
audience scope) and CCv2/CCv3 import. But it has **no config-template authoring surface** —
a character or world YAML cannot include lorebook entries; only import or runtime UI can.
This task adds lorebook-entry authoring to character/world config templates and seeds them.

## Background

Gap analysis (`.tmp/creative-content-systems-gap-analysis.md`, 2026-08-23): lorebook runtime
is advanced vs famous systems (SillyTavern character_book, AI Dungeon lore), but the config
bridge is missing. `TASK-lorebook-export` covers export round-trip, not config seeding. The
character/world coverage tickets list `lorebook` under extensions but do not specify entry
seeding — this task makes it concrete and cross-cutting.

## Work

1. **Extend `CharacterTemplate`** (`src/config/sections/characters/types.ts`) with:
   - `lorebook?: LorebookEntryTemplate[]` (keys, content, insertion order/depth, token budget,
     cooldown, activation, audience scope — mirrors `LorebookEntry`)
2. **Extend `SeedWorld` / `SeedLocation`** (`src/config/schema/seeding.ts`) with the same
   `lorebook?: LorebookEntryTemplate[]` block.
3. **Seed logic:** in `seedTemplate` (`src/characters/seed/templates.ts`) and `seedWorlds`
   (`src/seeding/worlds.ts`), persist lorebook entries into `actor_lore_entries` /
   `world_lore_entries` by reusing the existing CCv2/CCv3 normalizer/importer mapping
   (`src/characters/normalizers/shared.ts`, `src/routes/import/lorebook.ts`).
4. **Example configs:** add `lorebook` examples to `configs/templates/character.example.yaml`
   (+ toml) and the new `configs/templates/world.example.yaml` (+ toml).
5. **Tests:** round-trip (seed → read → export) for lorebook entries.

## Acceptance Criteria

- A character YAML can seed lorebook entries (persisted to `actor_lore_entries`).
- A world/location YAML can seed lorebook entries (persisted to `world_lore_entries`).
- Seeding reuses existing normalizer/importer mapping (no schema fork).
- Example configs demonstrate the `lorebook` block.
- Round-trip test: seed with lorebook → export → lorebook present.
- Linked from `TASK-char-template-full-model-coverage` / `TASK-world-template-full-model-coverage`.

## Related Files

- `src/config/sections/characters/types.ts`
- `src/config/schema/seeding.ts`
- `src/characters/seed/templates.ts`, `src/seeding/worlds.ts`
- `src/characters/normalizers/shared.ts`, `src/routes/import/lorebook.ts`
- `src/characters/exporters/shared.ts` (`LorebookEntry`)
- `configs/templates/character.example.yaml`, `configs/templates/world.example.yaml`

## Notes

- Cross-cutting: coordinate with both character + world coverage tickets; do not duplicate
  their extension work — this task is the lorebook-specific seeding implementation.
