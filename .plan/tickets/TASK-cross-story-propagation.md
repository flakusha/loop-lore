<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cross-story event propagation logic

**Status:** Draft
**Priority:** P1 — High
**Epic:** `epic-timeline-system.md`
**Type:** Feature

## What

Implement event propagation across stories within the same timeline. When an event occurs in one story, related stories in the same timeline receive proximity-based history updates.

## Why

Enables shared world state — events in one chat affect other chats in the same timeline.

## Implementation

- Extend `src/story/timeline/world-timeline.ts` with propagation logic
- Add `propagateEvent(event, timelineId)` function
- Proximity scoring: events within N days and same location propagate
- Conflict detection: contradictory events flagged for GM review

## Acceptance Criteria

- [ ] `propagateEvent()` function implemented
- [ ] Proximity scoring algorithm (time + location)
- [ ] Conflict detection for contradictory events
- [ ] Unit tests for propagation scenarios
- [ ] Integration with existing `appendTimelineEvents()`

## Dependencies

- Timeline selection API (TASK-timeline-selection-api)
- `world_timeline_events.timeline_id` migration (TASK-timeline-id-world-timeline-events)
