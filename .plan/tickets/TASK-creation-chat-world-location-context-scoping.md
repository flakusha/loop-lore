<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Creation Chat World Location Context Scoping

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-assistant-gm-flows
**Tags:** in-place-generation, assistant-chat, context, world, location
**Depends on:** `FEAT-in-story-character-generation-via-assistant-chat-handoff.md` (handoff target)

## Summary

The assistant creation chat that the in-place generation flow reroutes to is
**context-scoped to the world and location** where the entity was introduced —
not just seeded with the detected entity info. Generation finalizes against the
actual world state: lore, location facts, existing inhabitants, items, and species.

## Design

- **Context bundle:** seeded chat context = detected entity info (today) + world
  lore entries + introducing location details (population, connections) + existing
  entities at that location (characters present, items, species habitat matches)
  + the story window around the introduction point.
- **Lore access reuse:** lore filtering follows the creating user's access profile
  (`epic-character-npc-lore-access.md`); no lore the user cannot access enters the
  creation context.
- **Consistency feed:** the bundle is the input for the workflow `consistency`
  quality gate — finalized specs are checked against the same world state they
  will join.
- **Refresh on finalize:** when the spec finalizes, the context bundle refreshes so
  review happens against current world state.

## Acceptance Criteria

- [ ] Handoff seeds the creation chat with the world/location context bundle, not
      entity info alone.
- [ ] Lore entries filtered by the creating user's access profile.
- [ ] Location facts include population/species presence when the bestiary layer exists.
- [ ] Consistency gate consumes the same bundle; spec-vs-world contradictions are
      blocked or warned per gate policy.
- [ ] No cross-world leakage: context is scoped to the introducing world/location.
- [ ] Unit tests: bundle assembly, access filtering, world scoping; integration:
      handoff → scoped context → finalize → consistency gate.

## Related

- `FEAT-in-story-character-generation-via-assistant-chat-handoff.md`
- `TASK-in-place-generation-owner-backfill.md`
- `epic-character-npc-lore-access.md`, `epic-enemies-monsters.md`
