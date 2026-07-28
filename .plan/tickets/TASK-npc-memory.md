# TASK: NPC Memory System

**Epic:** NPC/Actor System, Memory & Knowledge Systems
**Priority:** High
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G13 (NPC/Actor ↔ Supporting System)

## Summary

Implement NPC memory system with event recall, relationship memory, and memory decay.

## Background

NPCs need memory of player interactions, past events, and relationships. Without memory, NPCs cannot form opinions, remember player actions, or have evolving relationships.

## Implementation

### Core Components

1. Behavior state machine with defined states and transitions
2. Memory event recording and recall system
3. Inventory management with trading interface

## Acceptance Criteria

- [ ] NPCs record player interactions as memory events
- [ ] Memory events decay over time based on importance
- [ ] NPCs recall relevant memories during conversations
- [ ] Memory affects NPC disposition and dialogue
- [ ] NPC memory persists across world sessions

