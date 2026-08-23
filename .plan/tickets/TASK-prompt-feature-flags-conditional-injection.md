<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-prompt-feature-flags-conditional-injection

**Status**: open
**Priority**: medium
**Labels**: prompt-assembly, character-traits, feature-flags, architecture
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `docs/spec/character-spec.md` (CharacterFeatureFlags), `src/assistant/prompt/registry.ts`

## Description

The character spec defines `CharacterFeatureFlags` (rpg_mechanics, inventory,
relationships, mood, traits, lorebook, assets, nsfw) — but this concept has no
DB representation and no effect on prompt assembly.

Every prompt section builder currently uses simple `enabled()` checks (most
return `true`). This means all sections fire for all characters, wasting token
budget on irrelevant context.

A character with no RPG mechanics shouldn't get combat stats injected. A
character with no relationships shouldn't get relationship context. The
feature flag system should gate prompt section injection.

### Acceptance Criteria

- [ ] `CharacterFeatureFlags` stored in `actors.settings` JSON (or dedicated column)
- [ ] `AssembleContext` exposes `featureFlags: CharacterFeatureFlags`
- [ ] `PromptAssembler.assemble()` reads feature flags from actor record
- [ ] Each prompt section builder's `enabled()` checks relevant flag:
  - `characterTraitsSection` → `flags.traits`
  - `relationshipsSection` → `flags.relationships`
  - `moodSection` → `flags.mood`
  - `loreSection` → `flags.lorebook`
  - `nsfwTraitsSection` → `flags.nsfw`
- [ ] New `featureFlagsSection` injects active feature flags as system context
- [ ] `configs/templates/character.example.yaml` documents feature flags
- [ ] Default: all flags enabled (backward compatible)
- [ ] Unit tests: verify sections skip when flag is off

### Notes

- Feature flags are defined in `docs/spec/character-spec.md` §7.3 but not implemented
- The `extensions` JSON field on the canonical character card is the intended storage location
- Each flag should be explicitly settable via character creation/edit API
- Flags should propagate to template variables: `{{character.featureFlags}}`
