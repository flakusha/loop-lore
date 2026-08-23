<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Template — Full Canonical Model Coverage

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** High
**Type:** Feature Task / Coordination
**Tags:** characters, config, templates, seeding, schema
**Epic:** epic-character-core-system (config-templates sub-area)
**Related:** TASK-character-template-seeding, TASK-character-rpg-stats,
TASK-character-config-skills-professions, TASK-character-internal-traits,
TASK-character-voice-profile, TASK-proactive-messaging, TASK-memory-character-integration

## Summary

`CharacterTemplate` (`src/config/sections/characters/types.ts`) + `seedTemplate`
(`src/characters/seed/templates.ts`) currently expose only 8 flat fields plus identity
traits (species/gender/age/etc). The rich `CanonicalCharacter` / `CharacterExtensions`
model — stats, inventory, relationships, world_modifiers, feature_flags, translations,
lorebook, nsfw_categories/hard_limits, alternate_greetings, post_history_instructions,
creator_notes, nickname, character_version, behavioral dimensions, voice — is **unseeded**
even where the runtime code/services already exist. This task coordinates those fragmented
capabilities onto the single config-template authoring entry point so a character can be
fully defined in YAML/TOML.

## Background

Gap analysis (`.tmp/character-template-gap-analysis.md`, 2026-08-23) found the runtime model
is complete but the config-template bridge is missing. Feature tickets exist per-dimension
(stats, skills, internal-traits, voice, proactive, memory) but none converge on the
template. Result: ~90% of a character cannot be expressed via config seeding.

## Work

1. **Extend `CharacterTemplate`** to cover the full canonical model:
   - `extensions`: `stats`, `inventory[]`, `relationships[]`, `world_modifiers[]`, `feature_flags`, `translations`
   - `lorebook` (entries)
   - `nsfw_categories[]`, `nsfw_hard_limits[]`
   - `alternate_greetings[]`, `post_history_instructions`, `creator_notes`, `nickname`, `character_version`
   - behavioral dimensions: `coping`, `autonomy`, `aspirations`, `moral_disposition` (see `TASK-character-internal-traits`)
   - `voice` profile (see `TASK-character-voice-profile`)
2. **Extend `seedTemplate`** to persist each new dimension via the existing services:
   - stats/inventory/relationships/world_modifiers → `TraitsService` / `extensions` column
   - lorebook → lorebook table
   - nsfw fields → actor row
   - behavioral dims → `internal-traits` service
   - voice → voice profile store
   - Order-dependent seeding: relationships reference other seeded character IDs (seed graph in dependency order).
3. **Update `configs/templates/character.example.yaml`** with examples for each new field.
4. **Converge** existing fragmented tickets — link stats (TASK-character-rpg-stats),
   skills (TASK-character-config-skills-professions), internal-traits
   (TASK-character-internal-traits), voice (TASK-character-voice-profile) as the
   template-seeding integration point; do not re-implement their schemas.

## Acceptance Criteria

- A character defined in YAML can seed: stat block, inventory, relationship graph,
  lorebook, nsfw categories/limits, alternate greetings, behavioral dimensions, and voice.
- `seedTemplate` idempotently persists all seeded dimensions (no orphaned rows on re-seed).
- `character.example.yaml` demonstrates every new field.
- Unit + integration tests for the expanded seeding flow.
- Existing per-dimension tickets reference this task as their config-entry point.

## Related Files

- `src/config/sections/characters/types.ts`
- `src/characters/seed/templates.ts`
- `src/characters/spec/character.ts`
- `src/characters/services/internal-traits/`
- `configs/templates/character.example.yaml`

## Notes

- This is a coordination task, not a schema-redesign task. Reuse existing services.
- Relationship seeding must resolve cross-template IDs (seed order = topological by reference).
