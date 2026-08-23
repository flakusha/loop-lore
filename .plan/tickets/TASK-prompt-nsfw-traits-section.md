<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-prompt-nsfw-traits-section

**Status**: open
**Priority**: medium
**Labels**: prompt-assembly, nsfw, character-traits, templates
**Assignee**:
**Epic**: epic-nsfw-integration-gaps
**Related**: `src/db/schema-character.ts` (7 NSFW tables), `docs/spec/nsfw-integration.md`

## Description

Seven NSFW character trait tables exist in the DB schema but none inject
into the LLM prompt:

| Table | Key Columns |
|---|---|
| `character_intimacy` | `intimacy_level`, `comfort_zone`, `boundaries`, `preferences` |
| `character_arousal` | `base_arousal`, `current_arousal`, `arousal_rate`, `sensitivity` |
| `character_desire_profile` | `libido_level`, `desire_triggers`, `kinks`, `turn_offs` |
| `character_seduction_skills` | `skill_category`, `skill_level`, `techniques` |
| `character_body_profile` | `body_type`, `measurements`, `features`, `sensitive_zones` |
| `character_fantasies` | `fantasy_category`, `description`, `intensity`, `frequency` |
| `character_heat_cycle` | `cycle_phase`, `intensity`, `duration`, `next_phase_at` |

These traits influence character behavior and should be available for:
1. NSFW-rated chats (gated by `content_rating`)
2. Config-driven template variables for custom system prompts
3. Conditional injection based on NSFW content rating

### Acceptance Criteria

- [ ] New `nsfwTraitsSection` prompt section builder
- [ ] Registered in `PROMPT_SECTIONS` (after `nsfwPolicySection`, before `internalTraitsSection`)
- [ ] `enabled()` checks `params.config?.nsfw?.contentRating` — only injects for NSFW chats
- [ ] Respects character `content_rating` — only includes traits for NSFW-rated characters
- [ ] Groups by table: Intimacy, Arousal, Desire, Skills, Body, Fantasies, Cycle
- [ ] Each group is a subsection within the XML wrapper
- [ ] Section XML-wrapped: `<nsfw_character_traits>...</nsfw_character_traits>`
- [ ] Template variables per table: `{{character.intimacy}}`, `{{character.arousal}}`, etc.
- [ ] Sensitive fields (measurements, sensitive_zones) use the visibility model from `epic-character-internal-traits.md`
- [ ] Unit tests: verify injection only for NSFW-rated chats, verify content gating, verify rendering

### Notes

- This is a large task — consider splitting into sub-tasks per table group
- All 7 tables are already in `src/db/schema-character.ts` and `src/db/schema.ts`
- Migration `041_proactive_messaging_and_traits.ts` created the mood/traits tables
- The NSFW traits follow the same pattern as `character_world_traits` / `character_internal_traits`
- Heat cycle has time-based state — only inject when phase is active
- Desire profile and fantasies should respect the `visible | hidden` visibility model
