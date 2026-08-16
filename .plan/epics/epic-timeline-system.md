<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Timeline System

**Status:** Draft\
**Priority:** High\
**Effort:** High\
**Type:** Feature Epic\
**Tags:** timeline, branching, world events, chronology

## Overview

Extends the time scale system (epic-time-scale.md) to manage branching world timelines, event propagation, and timeline-specific knowledge. Enables players to experience alternate histories and GMs to steer narrative through timed events.

## Key Features

- **Branching Timelines**
  - Support multiple concurrent timelines per world (e.g., "Prime Timeline", "Dark Age", "Golden Age")
  - Timeline selection UI in world detail page (`/worlds/:id`)
  - Timeline-specific event storage and lore activation
- **World Timeline Events**
  - Extend `world_timeline_events` with `timeline_id` column
  - Backstory seeding via `seedBackstory` (already implemented)
  - Forward event steering: `FutureEventSteering` interface for probabilistic future events
  - Cross-story convergence: shared world event timeline with proximity-based history propagation
- **Event → Lore Promotion**
  - Leverage existing `promoteEventToLore` (implemented) with timeline-aware scoping
  - Timeline-specific lore entries via `audience_scope.timeline_id`

## Acceptance Criteria

- [ ] Timeline branching UI in `docs/frontend/worlds.md` (world detail page)
- [ ] `world_timeline_events` schema updated with `timeline_id` (migration)
- [ ] Timeline selection API in `src/story/timeline/world-timeline.ts`
- [ ] Cross-story event propagation logic in `src/story/timeline/index.ts`
- [ ] Timeline-specific lore injection in `src/assistant/prompt/sections/lore.ts`
- [ ] Unit tests for timeline branching and event propagation

## Dependencies

- `epic-time-scale.md` (for time progression mechanics — required upstream)

## Dependents (downstream epics that build on this)

- `epic-memory-propagation.md` (adds timeline-aware memory scopes)
- `epic-lore-knowledge.md` (adds timeline-specific lore)
- `epic-rarity-extensions.md` (adds timeline-weighted rarity)

## Related Epics

- `epic-world-locations.md` (for location-based event context)

## Ownership

- **Owns**: `world_timeline_events.timeline_id` column, timeline branching UI, cross-story event propagation
- **Provides**: `timeline_id` foreign key for downstream epics to reference

---

_Notes: Builds upon migration `030_world_timeline_events.ts` and service `src/story/timeline/world-timeline.ts`. Timeline selection UI reuses existing world detail page patterns. This is the foundational epic — all other timeline-aware epics depend on this._
