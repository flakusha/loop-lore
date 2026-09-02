<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: config schema emitter missing top-level sections

**Status:** ⬜ Not Started
**Priority:** Medium
**Epic:** epic-api-validation-guardrails.md

## Summary

**What**

`src/config/schema-class/json-schema/index.ts` (`jsonSchema()` function) is a hand-written JSON schema emitter that does NOT include the following top-level config sections, even though TypeScript `Config` (`src/config/schema/config.ts`) does:

- `templates` (added in commit `7e87e7b8` or earlier; has the `CharacterTemplateConfig` wardrobe fields from the wardrobe epic)
- `characters` (added in commit `5be327ff` or earlier; has the wardrobe `default_outfit`/`outfits`/`loadouts` fields)
- `frontend` (added when frontend config landed)
- `encryption` (added when encryption config landed)
- `seeding` (added when seeding config landed)

`scripts/check-schemas.ts` reports "JSON Schema is up-to-date" (green) because regenerating produces zero diff — the emitter is the source of truth, and it's missing these sections. The TypeScript `Config` interface and the `ConfigSchema` instance in `src/config/schema-class/index.ts` both have them registered.

**Why**

External consumers of `schemas/loop-lore-config.schema.json` (YAML/TOML editors, IDE tooling, documentation generators) cannot validate configs that use `templates.character.templates[].outfits` or `characters.templates[].outfits` fields because those fields are absent from the published JSON schema.

The wardrobe epic (commit `651854da`, 2026-09-02) discovered this when auditing the JSON schema diff. The fields exist in TypeScript source but are absent from the generated JSON. The TypeScript `Config` interface is the source of truth and the JSON emitter needs to be expanded to cover all sections.

**Where**

- `src/config/schema-class/json-schema/index.ts` — top-level `properties` map in `jsonSchema()` function (missing: `templates`, `characters`, `frontend`, `encryption`, `seeding`)
- `src/config/schema-class/json-schema/{llm,sd,avatar,imageEdit,character,characters,frontend,encryption,seeding,...}.ts` — missing sub-schema files
- `schemas/loop-lore-config.schema.json` — output of the emitter (currently stale)

**How to fix**

1. Audit `src/config/schema-class/index.ts` to enumerate every section registered in `createConfigSchema()`.
2. For each section not present in `json-schema/index.ts`, write a corresponding sub-schema file under `src/config/schema-class/json-schema/` matching the pattern of existing sub-schemas (e.g. `llm.ts`, `sd.ts`).
3. Add the section to the top-level `properties` map in `jsonSchema()` with proper imports.
4. Run `bun run src/config/generate-schema.ts` to regenerate `schemas/loop-lore-config.schema.json`.
5. Verify with `bun run scripts/check-schemas.ts` — gate should remain green.
6. Manually inspect the regenerated JSON to confirm wardrobe fields (`outfits`, `loadouts`, `default_outfit`) are now present in the `templates.character.templates.items.properties` and `characters.templates.items.properties` schemas.

**Acceptance**

- `jsonSchema()` in `json-schema/index.ts` includes `templates`, `characters`, `frontend`, `encryption`, `seeding` in top-level `properties`
- `schemas/loop-lore-config.schema.json` regenerates and contains the wardrobe fields (`outfits`, `loadouts`, `default_outfit`)
- `bun run scripts/check-schemas.ts` green
- No regression in TypeScript schema (run `bun run check`)

**Related**

- Wardrobe epic: commit `651854da`
- `src/config/schema/config.ts:57-58`: `templates: TemplatesConfig; characters: CharactersConfig;` (TypeScript source of truth)
- `src/config/schema-class/index.ts:109-110`: `templates: TEMPLATES_DEFAULTS, characters: CHARACTERS_DEFAULTS,` (registered in ConfigSchema)
- `src/config/sections/characters/defaults.ts:36-69`: wardrobe fields
- `src/config/sections/characters/types.ts`: `CharacterOutfitTemplate`, `CharacterLoadoutTemplate`

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
