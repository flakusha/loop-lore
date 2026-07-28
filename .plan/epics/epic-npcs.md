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
