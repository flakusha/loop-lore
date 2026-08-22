<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location Explorer

**Status:** ✅ Done (2026-08-22, feature/location-explorer-ui)
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Task
**Tags:** world, frontend, ui, locations
**Epic:** epic-world-management-ui.md

## Summary

Location browser for exploring world locations.

## Core Features

- Location tree view
- Search and filter
- Location details preview
- Quick navigation

## Acceptance Criteria

- [x] Hierarchical location tree view
- [x] Search locations by name
- [x] Filter by status (type/region deferred to LLM/SD prompt layer per 2026-08-22 decision — see epic-frontend-backend-integration.md)
- [x] Location details preview on hover (350ms throttle)
- [x] Quick navigation to selected location (Open button → /worlds/:id/locations/:locId)
- [x] Mobile responsive (stacks tree+detail below 768px)

## Files Touched

- `src/frontend/alpine/location-explorer.ts` — added filter state, hover-preview throttle, detail cache, navigateTo
- `src/frontend/alpine/location-explorer.test.ts` — new, 13 tests covering filter + tree + cache
- `src/views/world-edit.html` — Explore tab: filter bar, hover handlers, navigate button
- `src/public/css/app.css` — responsive stack below 768px

No migration added (no schema extension — `type`/`region` deferred to LLM/SD prompt layer per user decision).

## Related

- `src/routes/location-explorer.ts` (existing) — backend route, no changes needed
- `src/routes/location-explorer.test.ts` (existing) — backend tests, no changes needed
- `src/routes/worlds/locations.ts` (existing) — CRUD routes, unchanged
