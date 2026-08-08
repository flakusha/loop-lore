# TASK: Timeline selection API — backend endpoints

**Status:** Draft
**Priority:** P0 — Critical
**Epic:** `epic-timeline-system.md`
**Type:** Feature

## What

Add API endpoints for timeline CRUD and selection within a world.

## Why

Frontend timeline UI needs backend support for creating, listing, and selecting timelines.

## Endpoints

```
GET    /api/worlds/:worldId/timelines          — list timelines
POST   /api/worlds/:worldId/timelines          — create timeline
GET    /api/worlds/:worldId/timelines/:id      — get timeline detail
PUT    /api/worlds/:worldId/timelines/:id      — update timeline
DELETE /api/worlds/:worldId/timelines/:id      — delete timeline
POST   /api/worlds/:worldId/timelines/:id/select — set active timeline (session)
```

## Acceptance Criteria

- [ ] All endpoints implemented in `src/routes/world-timelines.ts`
- [ ] Validation via Elysia `t` (TypeBox) schemas
- [ ] Ownership checks (user owns world)
- [ ] Session stores selected timeline per world
- [ ] Unit tests for all endpoints
- [ ] OpenAPI docs updated

## Dependencies

- `world_timeline_events.timeline_id` migration (TASK-timeline-id-world-timeline-events)
