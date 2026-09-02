<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character & NPC Lore Access

**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** character, npc, lore, memory, access, world, skills, knowledge, communication
**Related:** epic-memory-knowledge-systems.md, epic-lore-knowledge.md, epic-actors.md, epic-actor-autonomy-story-drive.md

## Summary

Enables characters and NPCs to access world lore, location previous events, and lore entries based on their personal history, acquired skills, knowledge domains, and communication history. This epic defines the access control logic and integration points that determine what lore a character can perceive, recall, or act upon based on their individual profile and experience.

## Motivation

Currently, the lore system treats all characters equally — any character can potentially access any lore entry. This epic introduces character-dependent access control so that:

- A character with "diplomatic" skills can access political lore
- A character who experienced a specific event can recall related lore
- A character who communicated with a faction can access faction-specific lore
- Memory integration ensures lore access is consistent with a character's personal narrative

## Architecture

### Access Tiers

| Tier | Determination | Examples |
|------|--------------|----------|
| **History-based** | Events the character has experienced | "I was present when the dragon attacked", "I helped build the northern bridge" |
| **Skills-based** | Skills the character possesses | "I have mastery in herb-lore", "I know the ancient language" |
| **Knowledge-based** | Facts the character has learned | "The capital's name is Valerius", "House Amaryllis rules the east" |
| **Communication-based** | Characters/factions the character has interacted with | "I spoke with the temple priest", "I traded with the caravan" |

### Access Control Logic

```
character.lore_access = history ∪ skills ∪ knowledge ∪ communication
```

Each lore entry has access tags; a character can access an entry if their access profile intersects with the entry's tags.

### Integration Points

1. **Prompt assembly** — lore entries included in character prompt based on access profile
2. **Memory retrieval** — memories that reference lore entries are filtered by access profile
3. **Lore injection** — `epic-lore-knowledge.md` secret lore uses access profile to determine reveal conditions
4. **NPC behavior** — NPCs use access profile to determine what lore they can reference in their actions

## Scope

### Included

- Access profile generation from character history, skills, knowledge, communication
- Lore entry access tags and intersection logic
- Prompt assembly integration to filter lore by access profile
- NPC behavior integration — what lore an NPC can reference
- Memory integration — memory filtering based on access profile
- Integration with existing `actor_lore_entries` and `world_lore_entries` tables

### Excluded

- Decision intelligence (BDI/reactions — `epic-agency-story-points.md`)
- Movement/pathfinding internals (`epic-npc-navigation.md`)
- AI director tension/arc scoring (`epic-assistant-gm-flows.md`)
- HTTP transport rate limiting

## Acceptance Criteria

- [ ] Access profile generated from character history, skills, knowledge, communication
- [ ] Lore entries have access tags; intersection logic determines character access
- [ ] Prompt assembly filters lore entries by character access profile
- [ ] NPC behavior references lore only within access profile
- [ ] Memory retrieval filters by character access profile
- [ ] Integration with `actor_lore_entries` table (timeline_id, reveal_condition)
- [ ] Integration with `world_lore_entries` table (timeline_id, reveal_condition)
- [ ] Unit tests for access profile generation and intersection logic
- [ ] End-to-end test: character with specific history/skills accesses appropriate lore

## Dependencies

- `epic-memory-knowledge-systems.md` (memory system, emotion-impact fields)
- `epic-lore-knowledge.md` (lore entries, timeline_id, reveal_condition)
- `epic-actors.md` (actor table, character card columns, lorebooks)
- `epic-actor-autonomy-story-drive.md` (autonomy governor, rate limits)
- `epic-character-core-system.md` (skill progression, character growth)
- `docs/spec/lore.md` (lore spec, existing entry schema)
- `docs/spec/memory-system.md` (memory system schema)
- `epic-wardrobe-avatar-variants.md` — loadout descriptors feed the access profile (skills-based access for armor/weapon lore; communication-based for faction outfits); outfit binding rules may gate lore reveal (court dress = court lore visible)

## Integration Points

### Systems This Epic Depends On

| System                    | What It Provides                          | How Used                                    |
| ------------------------- | ----------------------------------------- | ------------------------------------------- |
| Memory Systems            | MemoryEmotionImpact, timeline_id          | Memory filtering based on access profile    |
| Lore Knowledge System     | reveal_condition, timeline_id, rarity     | Lore access control via reveal conditions   |
| Actor System              | character card columns, lorebooks         | Access profile derived from character data  |
| Character Core System     | skill progression, growth events          | Skills-based access determination           |
| Timeline System           | timeline_id, timeline branching           | Timeline-scoped access control              |

### Systems That Depend On This Epic

| System                    | What It Consumes                          | How Used                                    |
| ------------------------- | ----------------------------------------- | ------------------------------------------- |
| Prompt Assembly           | Filtered lore entries                     | Only accessible lore included in prompt     |
| NPC Behavior              | Accessible lore for NPC actions           | NPCs reference only lore within their profile|
| Memory Retrieval          | Filtered memories                         | Memories consistent with access profile     |
| Relationship Service      | Lore-based relationship updates           | Relationship changes tied to lore access    |

### Shared Data Contracts

| Contract              | Shared With                | Purpose                                    |
| --------------------- | -------------------------- | ------------------------------------------ |
| LoreAccessProfile     | Prompt Assembly            | Character's accessible lore set            |
| Access Tag            | Lore Entry Schema          | Tags that determine entry accessibility     |
| timeline_id           | Timeline System            | Timeline-scoped access scoping             |

### Cross-System Events

| Event                  | Direction | Purpose                                              |
| ---------------------- | --------- | ---------------------------------------------------- |
| character.profile.update | emits     | Notify lore system when character's access profile changes |
| lore.access.check      | emits     | Check if character can access specific lore entry    |
| memory.lore.filter     | subscribes| Filter memories by character access profile          |

## Tasks

- [ ] **Access profile schema** — Define `LoreAccessProfile` interface with history, skills, knowledge, communication fields; migration to add access profile column to `actors` table → ticket `TASK-lore-access-profile-schema-and-migration` (issue 6ed7cc4)
- [ ] **Lore entry access tags** — Add `access_tags` field to `actor_lore_entries` and `world_lore_entries`; define tag taxonomy (history, skills, knowledge, communication) → ticket `TASK-lore-entry-access-tags-and-taxonomy` (issue 337dd4b)
- [ ] **Access profile generation** — Implement function to generate access profile from character history, skills, knowledge, communication; integrate with character creation and update flows → ticket `TASK-access-profile-generation-from-actor-experience` (issue c7a9b06)
- [ ] **Access intersection logic** — Implement intersection logic between character access profile and lore entry access tags; unit tests for all tag combinations → ticket `TASK-lore-access-intersection-logic` (issue 563d9e5)
- [ ] **Prompt assembly integration** — Modify prompt assembly to filter lore entries by character access profile; ensure only accessible lore is included in character prompt → ticket `TASK-prompt-assembly-lore-filtering-by-access-profile` (issue 25d32a4)
- [ ] **NPC behavior integration** — Integrate access profile into NPC generation pipeline; NPCs reference only lore within their access profile → ticket `TASK-npc-behavior-lore-access-gating` (issue 6baebbc)
- [ ] **Memory integration** — Filter memory retrieval by character access profile; ensure memories reference only lore within access profile → ticket `TASK-memory-retrieval-filtering-by-lore-access-profile` (issue dc745aa)
- [ ] **End-to-end test** — Verify character with specific history/skills accesses appropriate lore; verify NPC behavior consistency (unit tests accompany each slice ticket) → ticket `TASK-lore-access-end-to-end-verification` (issue 2c1ed3d)