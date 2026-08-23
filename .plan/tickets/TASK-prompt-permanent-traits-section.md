<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-prompt-permanent-traits-section

**Status**: open
**Priority**: medium
**Labels**: prompt-assembly, character-traits, templates
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `src/db/schema-character.ts` (CharacterPermanentTraits), `src/assistant/prompt/sections/character-traits.ts`

## Description

`character_permanent_traits` table exists in DB with `trait_category`,
`trait_name`, `trait_value`, `immutable` columns — but no prompt section
builder injects these traits into the LLM context.

Permanent traits are core character identity: species, gender, age, physique,
occupation, background. They should be available as both:
1. A dedicated prompt section (like `characterTraitsSection` for world/location traits)
2. Template variables for custom system prompts (e.g. `{{character.permanentTraits}}`)

### Acceptance Criteria

- [ ] New `permanentTraitsSection` prompt section builder in `src/assistant/prompt/sections/`
- [ ] Registered in `PROMPT_SECTIONS` in `src/assistant/prompt/registry.ts` (before `internalTraitsSection`)
- [ ] Section groups traits by `trait_category` (same pattern as `characterTraitsSection`)
- [ ] Respects `immutable` flag — immutable traits get `[core]` prefix
- [ ] Section is XML-wrapped: `<permanent_traits>...</permanent_traits>`
- [ ] Template variable `{{character.permanentTraits}}` resolves to formatted trait list
- [ ] Unit test in `src/assistant/prompt/sections/` verifying rendering

### Notes

- Follow the pattern from `characterTraitsSection` (world/location traits)
- Permanent traits have no world/location scope — always injected when character has them
- The `TraitCategory` enum includes: `physical`, `mental`, `social`, `background`, `occupation`, `species`, `identity`
