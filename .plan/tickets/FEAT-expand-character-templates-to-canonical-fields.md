<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: expand character templates to canonical fields

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** character-spec

**Summary:**

## Summary

The user-facing character-template surface is a strict subset of the character surface the application already edits and exports. Two parallel types define the same config shape and they have drifted:

- the YAML/loader type `CharacterTemplateConfig` (`src/config/sections/templates.ts:191-213`) — name/description/personality/appearance/scenario/welcome/system_prompt/mes_example/tags/creator/visibility/content_rating/target_roles/is_template/is_default + wardrobe (default_outfit/outfits/loadouts);
- the seeder type `CharacterTemplate` (`src/config/sections/characters/types.ts:7-67`) — the same, **plus** identity (species/subrace/gender/age/homeland/culture) and `avatar`.

Everything below is absent from **both**, yet supported elsewhere.

### Group A — column exists, no template field, no seed write (zero migration)

| Canonical field | `actors` column | App-edit path already accepts it |
|---|---|---|
| `alternate_greetings` | `src/db/schema-core.ts:401` | `src/routes/characters/update.ts:194` |
| `post_history_instructions` | `:402` | `:194` |
| `creator_notes` | `:403` | `:195` |
| `character_version` | `:405` | `:197` |
| `growth_mode` | `:414` | `:198` |
| `llm_assist_enabled` | `:415` | `:199` |

`seedTemplate` (`src/characters/seed/templates.ts:113-139`) writes none of them, so a template can never seed an alternate greeting or turn growth on. Writing `alternate_greetings:` in `character.yaml` is silently dropped — the type does not list the field and the seeder reads only the fields it knows.

### Group B — canonical only, needs new wiring (no `actors` column)

`lorebook` (per-actor CRUD already exists: `src/routes/actor-lore-entries.ts`), `assets`, `extensions`, `nickname`, `nsfw_categories`, `nsfw_hard_limits` — all present on `CanonicalCharacter` (`src/characters/spec/character.ts:192-229`) and in the CCV2/CCV3 import-export round-trip (`src/characters/exporters/png.ts:43-47`, `src/characters/normalizers/ccv2.ts:38-46`).

### Also two types for one shape

Unify `CharacterTemplateConfig` and `CharacterTemplate`, or derive the loader type from the seeder type, so the loader cannot drift again — identity fields are already in the seeder type and absent from the yaml type today.

## Fix (proposed)

1. Widen the template surface with Group A (types + loader + seed writes + example config + docs). Largest value, smallest cost — no migration, the update route and export already round-trip the fields.
2. Track Group B separately; each needs a storage decision (e.g. `lorebook` → `actor_lore_entries` rows rather than a JSON blob, since that route already exists).
3. Make the loader reject unknown keys, or at minimum surface the list of template fields it supports, so the next silent drop is loud.

**Context:**

Audit finding F4 in `.plan/configs-templates-wiring-audit.md`. The two parallel template types have already drifted once — identity fields live in the seeder type and not the yaml type. Group A costs no migration because `src/routes/characters/update.ts:193-199` already persists those columns and `src/routes/characters/export.ts:73-81` already round-trips them.

**Acceptance Criteria:**

- [ ] Group A fields accepted by the template loader, typed, and seeded into their existing columns
- [ ] seeded values survive an export → re-import round-trip
- [ ] one template type shared by the loader and the seeder (no parallel definitions)
- [ ] `configs/templates/character.example.{yaml,toml}` documents every new field
- [ ] Group B fields listed with their storage decision in a follow-up ticket
