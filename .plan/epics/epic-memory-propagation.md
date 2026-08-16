<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Memory Propagation

**Status:** Draft\
**Priority:** High\
**Effort:** Medium\
**Type:** Feature Epic\
**Tags:** memory, propagation, cross-timeline, cross-chat, isolation

## Overview

Defines rules for memory sharing/propagation across timelines and chats. Implements timeline-aware memory scopes, cross-session knowledge transfer, and privacy controls to prevent accidental knowledge leakage between isolated narrative spaces.

## Key Features

- **Memory Scopes**
  - **Character-private**: Memories only visible to that character's sessions
  - **Party-shared**: Memories shared within a party/group
  - **Timeline-shared**: Lore/events visible to all in this timeline
  - **GM-only**: Shadow notes, hidden lore (not propagated automatically)
- **Cross-Timeline Rules**
  - Default: Memories don't propagate between timelines
  - Exceptions: GM-created lore or rare events can seed knowledge across timelines
  - Explicit sharing flags on memory entries for controlled propagation
- **Cross-Chat Propagation**
  - Event ordering across sessions
  - Conflict detection for contradictory events
  - Timeline merge strategies for multi-session worlds

## Acceptance Criteria

- [ ] Memory scope enum implemented in `src/db/schema-memory.ts`
- [ ] Timeline-aware memory injection in `src/assistant/memory/injection.ts`
- [ ] Cross-chat event propagation logic in `src/story/timeline/world-timeline.ts`
- [ ] Memory isolation boundaries documented in `docs/spec/memory-system.md`
- [ ] Unit tests for isolation boundaries and timeline merging

## Dependencies

- `epic-timeline-system.md` (for timeline infrastructure — required upstream)
- `epic-memory-knowledge-systems.md` (for three-tier memory system — extends existing)

## Dependents (downstream epics that build on this)

- `epic-lore-knowledge.md` (uses memory scope rules for lore propagation)

## Related Epics

- `epic-multi-session.md`

## Scope Boundary (vs Memory & Knowledge Systems)

- **Memory & Knowledge owns**: episodic/semantic/procedural tiers, budget, extraction, injection, decay, promotion, purge
- **Memory Propagation owns**: cross-timeline isolation rules, cross-chat event propagation, timeline-aware scope enforcement, conflict detection for contradictory events

---

_Notes: Extends existing `src/memory/` and `src/story/timeline/` infrastructure. Leverages migration `030_world_timeline_events.ts` for event storage. Does NOT define memory tiers — that's Memory & Knowledge's domain._
