<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NPC Character Edit Stack Parity

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-npcs
**Tags:** npc, character, reuse, avatar, lore, traits, relationships
**Depends on:** `epic-character-core-system.md` (character services),
`TASK-assistant-creative-studio-workflow-npc.md` (generation workflow)

## Summary

NPC generation and editing **reuses the existing character edit capabilities
wholesale** — picture/avatar generation, lore, traits, relationships, mood —
instead of growing NPC-specific parallels. NPCs are actors (`is_npc: true`);
every character edit capability applies to them through the same services, routes,
and UI, scoped by kind where the distinction matters.

## Design

- **Capability matrix (character → NPC):**
  - Avatar/picture generation — `src/characters/services/emotion-avatar-service`,
    avatar seeding (`src/characters/seed/avatar.ts`): same pipeline, NPC-triggered.
  - Lore — `actor_lore_entries` CRUD via the same routes; NPC access profile from
    `epic-character-npc-lore-access.md`.
  - Traits — `traits-service` (+ internal traits) unchanged.
  - Relationships — `relationships-service` unchanged.
  - Mood — `mood-service` unchanged.
  - Import/export/validators — `src/characters/` parser/validator/exporter stack
    applies with NPC kind flag.
- **No parallel editors:** audit the tree for NPC-specific duplicates of the above;
  any found are folded into the shared service or removed.
- **UI parity:** the character edit surface serves NPCs with the same components;
  kind-specific fields (faction allegiance, retinue/trade behavior from the
  world-RPG batch) render as extensions, not forks.
- **Generation parity:** the NPC generation workflow and in-place generation
  dispatch into the same insert/update paths the edit surface uses.

## Acceptance Criteria

- [ ] Capability parity matrix documented and enforced: avatar generation, lore,
      traits, relationships, mood all operate on NPCs via the shared services.
- [ ] Audit finds no NPC-specific duplicate of a character edit service, route, or
      editor component; duplicates folded or removed.
- [ ] NPC avatar/picture generation runs through the emotion-avatar pipeline
      (no bespoke NPC image path).
- [ ] Character edit UI serves NPC editing with kind-scoped extensions only.
- [ ] Generated NPCs (workflow or in-place) are editable through the identical surface.
- [ ] Unit tests: shared services accept NPC actors; kind scoping where required.

## Related

- `epic-npcs.md`, `epic-character-core-system.md`
- `TASK-assistant-creative-studio-workflow-npc.md`
- `FEAT-in-story-character-generation-via-assistant-chat-handoff.md`
