<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: NPCs

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

## Generation via Creative Studio Workflows

NPC creation through the assistant is specified as a **config-driven workflow template**
in `epic-assistant-creative-studio-workflows.md` §7.6. The `npc-generation` workflow
(`TASK-assistant-creative-studio-workflow-npc.md`) adds a new `npc` `INTENT_PATTERNS`
target and wraps actor-insert (`is_npc: true`) with step building,
`entity_type_presets.npc` validation, and schema/consistency/duplicate quality gates.
Faction-allegiance steps reference `epic-faction-reputation.md`.
