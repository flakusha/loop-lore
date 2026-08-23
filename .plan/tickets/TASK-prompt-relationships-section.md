<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-prompt-relationships-section

**Status**: open
**Priority**: medium
**Labels**: prompt-assembly, character-traits, relationships, templates
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `src/db/schema-character.ts` (CharacterRelationships), `docs/spec/relationships.md`

## Description

`character_relationships` table stores inter-character relationship data
(`relationship_type`, `standing`, `trust`, `familiarity`, `is_bidirectional`,
`metadata`) — but no prompt section builder injects relationship context into
the LLM prompt.

Characters in group chats or worlds with NPCs should be aware of their
relationships with other participants. This data is critical for:
- Group chat dynamics (who's allied, rival, family)
- NPC interaction (standing, trust levels)
- Story consistency (familiarity affects dialogue tone)

### Acceptance Criteria

- [ ] New `relationshipsSection` prompt section builder
- [ ] Registered in `PROMPT_SECTIONS` (after `groupParticipantsSection`)
- [ ] Only injects when `params.groupParticipantIds` has entries
- [ ] Queries relationships where `target_actor_id IN (groupParticipantIds)`
- [ ] Formats each relationship: `[type] target: standing X/100, trust Y/100, familiarity Z/100`
- [ ] Bidirectional relationships marked with `↔`
- [ ] Section XML-wrapped: `<character_relationships>...</character_relationships>`
- [ ] Template variable `{{character.relationships}}` resolves to formatted list
- [ ] Unit test with mock group chat context

### Notes

- Only active when chat has other participants (group chat or world NPCs present)
- Relationship data is scoped to `world_id` (can be null for global)
- Standing is 0-100 scale; trust and familiarity also 0-100
- Consider token budget: if many relationships, truncate to top N by standing
- `metadata` JSON field may contain free-text notes — include if present
