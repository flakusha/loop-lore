<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character & NPC Lore Access

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** verified 2026-10-09: identity-scoped audience gating ships end to end — `src/assistant/lore/audience.ts` (`parseLoreScope`/`isLoreVisibleTo`), `src/assistant/prompt/sections/lore-identity.ts` (`resolveActorIdentity`), `audience_scope` JSON columns on both lore tables, and a first-position gate in `src/assistant/prompt/sections/lore.ts:85`; the epic's full `LoreAccessProfile` / `access_tags` / intersection model has no code — neither symbol appears anywhere in `src/`.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** character, npc, lore, memory, access, world, skills, knowledge, communication
**Related:** epic-memory-knowledge-systems.md, epic-lore-knowledge.md, epic-actors.md, epic-actor-autonomy-story-drive.md

## Summary

Enables characters and NPCs to access world lore, location previous events, and lore entries based on their personal history, acquired skills, knowledge domains, and communication history. This epic defines the access control logic and integration points that determine what lore a character can perceive, recall, or act upon based on their individual profile and experience.

## Implemented (verified 2026-10-09)

Identity-scoped audience gating — a strict subset of this epic — ships end to end:

- **Scope schema** — `audience_scope` (nullable JSON text) on `world_lore_entries`
  (`src/db/migrations/001_init.ts:587`), `actor_lore_entries` (`:901`) and
  `world_event_steerings` (`:647`); generated as `audience_scope: string | null` in
  `src/db/schema-story.ts:107,176` (the two lore tables) and `src/db/schema-core.ts:293`
  (`world_event_steerings`). Round-trips through the routes
  (`src/routes/actor-lore-entries.ts:51,54`), the lore CRUD
  (`src/actors/actor-lore.ts:141-144,209`) and world import (`src/routes/world-import/bundle.ts:188`).
- **Scope grammar** — `LoreSubject` = `world | location | profession | race` plus
  `requires_presence`, parsed by `parseLoreScope` in `src/assistant/lore/audience.ts:68`.
  Taxonomy documented at `docs/spec/lore.md` §3.
- **Visibility decision** — `isLoreVisibleTo(entry, identity, locationInScope?)` at
  `src/assistant/lore/audience.ts:88`: no scope → visible; `world` → visible;
  `race` → case-insensitive match on the actor's `species` trait; `profession` → any of
  the actor's profession traits or `professions.discipline` rows; `location` → exact id
  or ancestry callback, honouring `requires_presence: false`; unknown kind → hidden.
- **Identity resolution** — `resolveActorIdentity(db, actorId, worldId)` at
  `src/assistant/prompt/sections/lore-identity.ts:30` merges `character_permanent_traits`
  (`species`, `profession`/`class`) with world-scoped `professions.discipline` rows.
  `src/assistant/prompt/sections/lore-load.ts:124` fetches it in parallel with the lore
  SELECTs.
- **Prompt gate** — `src/assistant/prompt/sections/lore.ts:85` applies `isLoreVisibleTo`
  *before* cooldown/constant/selective activation, so forbidden lore is never considered.
- **Authoring path** — `src/assistant/commands/create-entity-lore.ts:117-147` serialises
  the scope (attaching a synthetic location subject when the author gives none) so
  `/create` entities ship with audience scope already populated.
- **Tests** — `src/assistant/lore/audience.test.ts` (all subject kinds + ancestry +
  `requires_presence` + unknown kind), `src/assistant/prompt/sections/lore.test.ts`
  (dark-elf-vs-human section gate), `src/assistant/messages/create-entity-confirm.test.ts`
  (scope serialisation), `src/story/timeline/world-timeline.test.ts:178` (imported scope
  still gates).

## Current State

| Surface | Status | Where |
| ------- | ------ | ----- |
| `audience_scope` column on both lore tables | Shipped | `src/db/migrations/001_init.ts:587` (world), `:901` (actor), `:647` (`world_event_steerings`) |
| Scope grammar + visibility decision | Shipped — race / profession / location / world | `src/assistant/lore/audience.ts:68,88` |
| Actor identity resolution for gating | Shipped | `src/assistant/prompt/sections/lore-identity.ts:30` |
| Prompt-assembly filtering | Shipped — gate runs first | `src/assistant/prompt/sections/lore.ts:85` |
| Scope authored on `/create` entity lore | Shipped | `src/assistant/commands/create-entity-lore.ts:117` |
| `LoreAccessProfile` (history ∪ skills ∪ knowledge ∪ communication) | Not shipped | no `LoreAccessProfile` symbol in `src/` |
| `access_tags` on lore entries + tag taxonomy | Not shipped | no `access_tags` field or column anywhere |
| Profile ∩ tag intersection logic | Not shipped | — |
| Access-profile generation from history/skills/knowledge/comms | Not shipped | — |
| Memory retrieval filtered by access profile | Not shipped | `isLoreVisibleTo` has exactly one production caller: `lore.ts:85` |
| NPC behaviour integration (separate access layer) | Not shipped | NPCs ride the same speaker-identity gate; no behaviour-side consult |
| `timeline_id` / `reveal_condition` on lore tables | Not shipped | neither column exists in `src/db/` |
| Timeline-scoped lore access | Out of scope of the shipped gate | `timeline_id` exists on `world_timeline_events` (`001_init.ts:624`), not on lore rows |

## Unticketed Gaps

Two things are missing without a ticket of their own. First, the shipped gate only
answers "who may know this entry" for **one speaker identity at prompt time** — there
is no read-side API that asks the same question for a *different* actor, so nothing can
preview what another character knows (an NPC knowledge panel, an oracle command, or a
GM "what does she know" query would all have to re-implement the decision). Second, the
`locationInScope` ancestry callback of `isLoreVisibleTo` (`audience.ts:91`) is never
passed in production: `lore.ts:85` calls it with two arguments only, and
`resolveActorIdentity` returns `locationId: null` (`lore-identity.ts:69`) before
`lore.ts:52-55` overwrites it with `chat.current_location_id`. Location scope therefore
degrades to exact-id equality — a scope bound to an ancestor region never matches from
prompt assembly, so nested location scoping is dead code on the only path that uses it.
The eight `TASK-lore-*` / `TASK-*-lore-access-*` tickets already carry the rest of this
epic's scope; neither gap needs a new one.

## Motivation

The lore system no longer treats every character equally at prompt time: an
`audience_scope` race/profession/location gate now filters entries before injection.
What is still missing is the character-dependent access control this epic was written
for, so that:

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

Designed model — **not shipped** (verified 2026-10-09):

```
character.lore_access = history ∪ skills ∪ knowledge ∪ communication
```

Each lore entry has access tags; a character can access an entry if their access profile
intersects with the entry's tags.

What actually runs today is the narrower identity gate documented under
`## Implemented (verified 2026-10-09)`: one `audience_scope` subject per entry
(`world | race | profession | location`) tested against the speaking actor's resolved
identity — no profile, no tags, no intersection.

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

- [ ] Access profile generated from character history, skills, knowledge, communication — no profile type or generator exists in `src/` (verified 2026-10-09)
- [ ] Lore entries have access tags; intersection logic determines character access — no `access_tags` field or column; the shipped mechanism is one `audience_scope` subject per entry (verified 2026-10-09)
- [x] Prompt assembly filters lore entries before injection (identity-scope gating) — `isLoreVisibleTo` runs first in `src/assistant/prompt/sections/lore.ts:85`, so forbidden lore is never considered for activation (verified 2026-10-09)
- [ ] NPC behavior references lore only within access profile — no behaviour-side access layer; NPCs ride the same speaker-identity gate (verified 2026-10-09)
- [ ] Memory retrieval filters by character access profile — `isLoreVisibleTo` has exactly one production caller (`lore.ts:85`); no memory path consults it (verified 2026-10-09)
- [ ] Integration with `actor_lore_entries` table (timeline_id, reveal_condition) — neither column exists; the shipped column is `audience_scope` (`001_init.ts:901`) (verified 2026-10-09)
- [ ] Integration with `world_lore_entries` table (timeline_id, reveal_condition) — neither column exists; the shipped column is `audience_scope` (`001_init.ts:587`) (verified 2026-10-09)
- [x] Unit tests for lore visibility decisions — `src/assistant/lore/audience.test.ts` covers every subject kind, the ancestry callback, `requires_presence` and unknown kinds (verified 2026-10-09)
- [ ] End-to-end test: character with specific history/skills accesses appropriate lore — only the race-identity scenario has section-level coverage (`src/assistant/prompt/sections/lore.test.ts`); history/skills access has none because it is unbuilt (verified 2026-10-09)

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

## Linked Tasks

All eight ticket files still read **Not Started** on disk (verified 2026-10-09). The
prompt-assembly slice has partial code in the identity-gating form described under
`## Implemented (verified 2026-10-09)`; the access-profile form it specifies is unbuilt.

- `TASK-lore-access-profile-schema-and-migration.md` (Not Started) — `LoreAccessProfile` interface + access-profile column on `actors`
- `TASK-lore-entry-access-tags-and-taxonomy.md` (Not Started) — `access_tags` on both lore tables + tag taxonomy
- `TASK-access-profile-generation-from-actor-experience.md` (Not Started) — profile generation from history/skills/knowledge/comms
- `TASK-lore-access-intersection-logic.md` (Not Started) — profile ∩ tag intersection + unit tests
- `TASK-prompt-assembly-lore-filtering-by-access-profile.md` (Not Started) — access-profile prompt filtering; only the narrower identity gate ships today
- `TASK-npc-behavior-lore-access-gating.md` (Not Started) — NPC generation pipeline consults the profile
- `TASK-memory-retrieval-filtering-by-lore-access-profile.md` (Not Started) — memory retrieval filtered by profile
- `TASK-lore-access-end-to-end-verification.md` (Not Started) — history/skills e2e scenario

## Files

Implemented (verified 2026-10-09):

- `src/assistant/lore/audience.ts` (+ `audience.test.ts`) — `LoreScope`, `LoreSubject`, `ActorIdentity`, `parseLoreScope`, `isLoreVisibleTo`
- `src/assistant/prompt/sections/lore-identity.ts` — `resolveActorIdentity`
- `src/assistant/prompt/sections/lore-load.ts` — identity fetched alongside the lore SELECTs
- `src/assistant/prompt/sections/lore.ts` (+ `lore.test.ts`) — the gate, applied first
- `src/assistant/commands/create-entity-lore.ts` — scope serialisation on `/create`
- `src/db/migrations/001_init.ts:587,901,647` — `audience_scope` columns
- `src/db/schema-story.ts:107,176` — generated `audience_scope` fields
- `src/routes/actor-lore-entries.ts`, `src/actors/actor-lore.ts`, `src/routes/world-import/bundle.ts` — scope round-trip

Planned (do not exist yet):

- `LoreAccessProfile` type module and its migration — no such file in `src/`
- `access_tags` column + tag taxonomy on `actor_lore_entries` / `world_lore_entries`
- Profile generator + intersection module and their unit tests
- Memory-side and NPC-behaviour-side access filters

## Related Epics

- `epic-memory-knowledge-systems.md` — memory system, emotion-impact fields; memory filtering is a downstream consumer
- `epic-lore-knowledge.md` — lore entries, reveal conditions, secret-lore injection
- `epic-actors.md` — actor table, character card columns, lorebooks
- `epic-actor-autonomy-story-drive.md` — autonomy governor, rate limits
- `epic-character-core-system.md` — skill progression and growth events the profile would read
- `epic-wardrobe-avatar-variants.md` — loadout descriptors would feed skills/communication access; outfit binding may gate lore reveal