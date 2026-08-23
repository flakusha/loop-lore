<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-prompt-character-extensions-section

**Status**: open
**Priority**: medium
**Labels**: prompt-assembly, character-spec, extensions, templates
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `docs/spec/character-spec.md` §1.3 (CharacterExtensions), `src/characters/character.ts`

## Description

The character spec defines `CharacterExtensions` as a catch-all for
plugin-defined structured data:

```typescript
interface CharacterExtensions {
  stats?: Record<string, number>;
  inventory?: InventoryItem[];
  relationships?: CharacterRelationship[];
  world_modifiers?: WorldModifier[];
  [key: string]: unknown;
}
```

None of this is injected into LLM prompts. The `extensions` JSON field on the
canonical character card is the intended storage location, but it's not yet
implemented in the DB or prompt assembly.

Key use cases:
- RPG stat blocks (STR, DEX, INT, etc.) → `{{character.extensions.stats}}`
- Inventory items → `{{character.extensions.inventory}}`
- Plugin-defined data → `{{character.extensions.<plugin-key>}}`

### Acceptance Criteria

- [ ] `CharacterExtensions` stored in `actors.settings.extensions` JSON
- [ ] New `extensionsSection` prompt section builder
- [ ] Registered in `PROMPT_SECTIONS` (after `internalTraitsSection`)
- [ ] Reads `character_feature_flags.extensions` or `flags.inventory`, `flags.rpg_mechanics`
- [ ] Renders known extension types:
  - `stats` → `RPG Stats: STR X, DEX Y, ...`
  - `inventory` → `Inventory: [equipped] Item Name (qty X), ...`
  - `world_modifiers` → `World Modifiers: [type] description (active/inactive)`
- [ ] Unknown extension keys rendered as `[plugin:key] JSON` for LLM context
- [ ] Template variables: `{{character.extensions}}`, `{{character.inventory}}`, `{{character.stats}}`
- [ ] Section XML-wrapped: `<character_extensions>...</character_extensions>`
- [ ] Unit test: stats rendering, inventory formatting, unknown key passthrough

### Notes

- This bridges the gap between spec-defined `CharacterExtensions` and runtime prompt assembly
- Plugin system should be able to register extension formatters
- Inventory rendering should distinguish equipped vs carried items
- World modifiers affect behavior — format prominently
- Extension data is JSON — format as human-readable for LLM consumption
