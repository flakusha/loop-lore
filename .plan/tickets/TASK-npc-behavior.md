# TASK: NPC Behavior State Machine

**Epic:** NPC/Actor System, NPC Navigation
**Priority:** High
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G12 (NPC/Actor ↔ Supporting System)

## Summary

Define NPC behavior state machines for autonomous NPC actions in combat, exploration, and social encounters.

## Background

NPCs need behavior state machines that drive autonomous decisions — patrol, chase, flee, socialize, trade — based on personality traits, faction, and current situation.

## Implementation

### Core Components

1. Behavior state machine with defined states and transitions
2. Memory event recording and recall system
3. Inventory management with trading interface

## Acceptance Criteria

- [ ] Behavior state machine defines states: idle, patrol, combat, social, trade, flee
- [ ] NPC personality (aggressive, passive, territorial) affects behavior decisions
- [ ] Faction membership influences behavior towards player and other NPCs
- [ ] Behavior transitions are deterministic based on game state
- [ ] NPC behavior is visible in combat and exploration modes

## Research Extensions (2026-08-14)

Research on agentic NPC systems (Inworld AI, generative-agents, Convai) identified extensions to this ticket:

### BDI Goal-Pursuit Extension
This state machine should be extended with BDI (Belief-Desire-Intention) goal pursuit:
- Daily planning loop from aspirations → hourly schedule → task decomposition
- Reaction system for perceived events (chat, wait, flee, attack)
- Plan revision when interrupted
- Chat buffer management to prevent infinite loops

**See:** `TASK-npc-bdi-planning.md` for full BDI planning implementation.

### Platform Candidate E1
Maps to platform research candidate E1 (Agentic NPC autonomy). P6+ deferred — fold BDI extension into this ticket when implementing.

### Cross-References
- `TASK-npc-bdi-planning.md` — BDI planning loop extension
- `TASK-npc-to-npc-social.md` — Social state in behavior machine
- `TASK-character-mood-happiness.md` — Mood affects behavior transitions
- `epic-character-internal-traits.md` — Personality drives behavior priorities
