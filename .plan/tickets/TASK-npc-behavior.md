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

