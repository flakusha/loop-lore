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

## Research Extensions (2026-08-14)

Research on agent memory systems (generative-agents, RisuAI HypaMemory) identified extensions:

### Scored Memory Model

Replace simple time-based decay with recency × importance × relevance scoring:
- Composite score determines memory retrieval priority
- Frequently accessed memories score higher
- Emotional memories receive importance boost

### Reflection System

Periodic synthesis of episodic memories into semantic insights:
- Top-scoring recent memories → higher-level character insights
- Reflections stored as semantic memory with elevated importance
- Source episodic memories linked to reflection

**See:** `TASK-agent-memory-scoring.md` for full scored memory implementation.

### Four-Tier Architecture

NPC memory should use the four-tier model from `epic-character-core-system.md`:
- Working (current context) → Episodic (events) → Semantic (facts) → Procedural (skills)
- Consolidation pipeline: merge, prune, strengthen, abstract

### Cross-References

- `TASK-agent-memory-scoring.md` — Scored retrieval + reflection
- `FEAT-memory-systems-three-tier.md` — Base three-tier system (extends to four with working tier)
- `TASK-memory-emotion-impact.md` — Emotional valence on memories
- `TASK-memory-decay-logic.md` — Decay replaced by scoring model
