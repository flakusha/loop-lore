<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Timeline selection API — backend endpoints

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** [2026-10-30, feat-timeline-remainder] 4 of the 6 endpoints (list/create/get-one/delete) already shipped with G2 in src/routes/worlds/timelines.ts — this ticket's remainder was PUT update + POST :id/select + persistence. Landed: (1) `PUT /api/worlds/:worldId/timelines/:id` — owner-gated, TypeBox-validated partial update (name/description), 400 on an empty body, 404 unknown id. (2) `POST /api/worlds/:worldId/timelines/:id/select` — persists the CALLER's active branch per world via upsert into the new `world_timeline_selections` table (migration 088, renumbered from 084 in c2fe32732, composite PK (user_id, world_id), FKs with ON DELETE CASCADE so deleting a selected fork drops the row). (3) Default-branch wiring: src/routes/views/worlds.ts falls back to the persisted selection when no `?timeline=` is given; unknown ids still fall back to `prime`.
**Status Note 2 (AC deviations, deliberate):** the ticket's stated file `src/routes/world-timelines.ts` never existed — the real file is `src/routes/worlds/timelines.ts`; followed the code. "Ownership checks (user owns world)" is enforced owner-only on create/update/delete; SELECT is gated on requireWorldAccess instead because it writes only the caller's own view-preference row, not the world — pinned by the "select admits a world MEMBER" test. "Session stores selected timeline per world" is implemented as a per-USER-per-world table (durable across sessions, strictly stronger). OpenAPI: no committed spec artifact exists (runtime-served via @elysia/openapi from the route `t` schemas, which both new routes carry), so the served spec is updated by construction.
**Priority:** P0 — Critical
**Epic:** epic-timeline-system
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

- [x] All endpoints implemented (list/create/get/delete pre-existing; PUT + select added) — in `src/routes/worlds/timelines.ts` (the ticket's `src/routes/world-timelines.ts` path was stale)
- [x] Validation via Elysia `t` (TypeBox) schemas
- [x] Ownership checks — owner-gated create/update/delete; select is access-gated (caller's own view row, see Status Note 2)
- [x] Selected timeline stored per user per world (`world_timeline_selections`, migration 088) and used as the world-detail default branch (src/routes/views/worlds.ts)
- [x] Unit tests for all endpoints (src/routes/worlds/timelines.test.ts update+select suite; src/routes/views/plugin-dynamic.test.ts persisted-selection default-branch test)
- [x] OpenAPI docs updated (runtime-served spec derives from the route `t` schemas; no committed artifact exists)

## Dependencies

- `world_timeline_events.timeline_id` migration (TASK-timeline-id-world-timeline-events)

**Resolved:** 2026-10-30 registry-driven close: git issue 0cc4bc6 (registry tip: c2945c0ac Konstantin Fedotov Close issue)
