<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Memory Propagation

**Overview:** (see sections below)


**Status:** In Progress (first slice landed)
**Status Note:** First slice (2026-10-30): scope enum + party/timeline semantics, timeline binding + injection isolation, cross-chat propagation helpers, isolation tests. `GM-only` scope from Key Features is NOT part of the ACs and remains open.
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

- [x] Memory scope enum implemented in `src/memory/types.ts` (party + timeline added; persisted as the plain-text `actor_memories.scope` column from `001_init.ts` — no CHECK constraint, so no enum migration was needed; new `timeline_id` column via `085_actor_memories_timeline_id.ts`)
- [x] Timeline-aware memory injection in `src/assistant/prompt/sections/memories.ts` + `memories-helpers.ts` (fetch filter `timeline_id IS NULL OR = :chatTimelineId`, 'prime' fallback; scope enforcement in `src/memory/provision.ts`)
- [x] Cross-chat event propagation logic in `src/story/timeline/world-timeline.ts` (`orderAcrossSessions`, `detectEventConflicts`, `mergeTimelineEvents`)
- [x] Memory isolation boundaries documented in `docs/spec/memory-system.md`
- [x] Unit tests for isolation boundaries and timeline merging (`src/memory/provision.test.ts`, `src/assistant/prompt/sections/memories-propagation.test.ts`, `src/story/timeline/world-timeline.test.ts`)

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

_Notes: Extends existing `src/memory/` and `src/story/timeline/` infrastructure. Timeline storage lives in `001_init.ts` (`world_timeline_events.timeline_id`) and `chats.timeline_id` (`048_chats_timeline_id.ts`); memory timeline binding in `085_actor_memories_timeline_id.ts`. Does NOT define memory tiers — that's Memory & Knowledge's domain._
