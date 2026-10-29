<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Timeline branching UI — world detail page

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Scope:** G2 timeline branching UI on world detail page
**Priority:** P0 — Critical
**Epic:** epic-timeline-system
**Related:** `TASK-timeline-in-chat-command.md` (in-chat /timeline command complementing this fixed-flow UI)
**Type:** Feature

## What

Add timeline selection UI to world detail page (`/worlds/:id`). Allow players to create, select, and switch between timeline branches.

## Why

Core UX for timeline system. Without this, players cannot interact with branching timelines.

## Acceptance Criteria

- [x] Timeline selector dropdown on world detail page (timeline-bar branch list, src/views/world-detail.html:38-62; ?timeline= threading src/routes/views/plugin-dynamic.ts:223-241 → serveWorldDetailContent timelineId → listTimelineEntries src/routes/views/worlds.ts)
- [x] "Create new timeline" button with name input (src/views/world-detail.html:63-70, create modal 72-120; worldTimelineBar Alpine store src/frontend/pages/world-timeline-bar.ts)
- [x] Timeline list shows: name, event count, created date (eventCount subquery src/routes/worlds/timelines.ts:50-84; rendered world-detail.html:55-58)
- [x] Switching timelines reloads events/lore for that branch (selectTimeline refetches /dynamic/worlds/:id/detail?timeline=…; worlds.ts:127-153 branch scoping)
- [x] HTMX-powered (no full page reload) (hx-get + hx-swap innerHTML fragment swap, world-detail.html:125-131; htmx.ajax fragment at plugin-dynamic.ts:223-241)
- [x] Mobile-responsive (timeline-bar/event block responsive rules src/public/css/app.css)

**Status Note:** Implemented on branch g2-timeline-branching commit faa6f1044; pending finalize/merge.

## Dependencies

- `world_timeline_events.timeline_id` migration (TASK-timeline-id-world-timeline-events)

## Related

- `docs/frontend/worlds.md` (world detail page spec)
