<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: NPCs

**Overview:** (see sections below)


**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** npcs, characters, ai, behavior, dialogue

## Overview

NPC system specification — covers NPC behavior models, dialogue systems, AI-driven interactions, and NPC lifecycle management. Supersedes NPC sections in `docs/spec/actors.md` and `docs/spec/worlds.md`.

## Reference

- Spec: `docs/spec/npcs.md`
- Related: `docs/spec/actors.md`, `docs/spec/worlds.md`

## NPC Systems

### Core NPC Model

interface NPC {
}
interface NPCBehavior {
}
interface NPCState {
}
interface NPCMemory {
}
interface NPCMemoryEntry {
}

## Acceptance Criteria

- [ ] NPC behavior model implemented
- [ ] NPC state machine functional
- [ ] NPC memory system working
- [ ] Dialogue system operational

## Related Epics

- `epic-actors.md` — NPCs are actors with `is_npc: true`; this epic focuses on NPC-specific behavior/memory
- `epic-character-core-system.md` — shared base fields (personality, traits, descriptions)
- `epic-character-world-setup.md` — per-world overrides of NPC setup (incl. outfit binding rules)
- `epic-wardrobe-avatar-variants.md` — NPCs carry outfit/loadout descriptors the same way characters do; selection + fallback ladder is shared

## Generation via Creative Studio Workflows

NPC creation through the assistant is specified as a **config-driven workflow template**
in `epic-assistant-creative-studio-workflows.md` §7.6. The `npc-generation` workflow
(`TASK-assistant-creative-studio-workflow-npc.md`) adds a new `npc` `INTENT_PATTERNS`
target and wraps actor-insert (`is_npc: true`) with step building,
`entity_type_presets.npc` validation, and schema/consistency/duplicate quality gates.
Faction-allegiance steps reference `epic-faction-reputation.md`.

### Character Edit Stack Parity

NPC generation and editing **reuses the character edit capabilities wholesale** —
picture/avatar generation, lore, traits, relationships, mood — through the same
services, routes, and edit UI (`src/characters/`). No NPC-specific parallel editors:
kind-specific concerns (faction allegiance, retinue/trade behavior) extend the
shared surface rather than forking it. Parity audit + enforcement:
`TASK-npc-character-edit-stack-parity.md`. Story-introduced NPCs generate in place
through the unified mechanism
(`FEAT-in-story-character-generation-via-assistant-chat-handoff.md`).
