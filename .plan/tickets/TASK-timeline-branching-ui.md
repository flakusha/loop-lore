# TASK: Timeline branching UI — world detail page

**Status:** Draft
**Priority:** P0 — Critical
**Epic:** `epic-timeline-system.md`
**Type:** Feature

## What

Add timeline selection UI to world detail page (`/worlds/:id`). Allow players to create, select, and switch between timeline branches.

## Why

Core UX for timeline system. Without this, players cannot interact with branching timelines.

## Acceptance Criteria

- [ ] Timeline selector dropdown on world detail page
- [ ] "Create new timeline" button with name input
- [ ] Timeline list shows: name, event count, created date
- [ ] Switching timelines reloads events/lore for that branch
- [ ] HTMX-powered (no full page reload)
- [ ] Mobile-responsive

## Dependencies

- `world_timeline_events.timeline_id` migration (TASK-timeline-id-world-timeline-events)

## Related

- `docs/frontend/worlds.md` (world detail page spec)
