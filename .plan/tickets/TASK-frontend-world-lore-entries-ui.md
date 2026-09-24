<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — World Lore Entries CRUD

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-world-locations
**Related:** TASK-world-locations, TASK-world-dashboard
**Source:** FE-BE harmonization check, 2026-09-17 — 5 routes in this slice. Note:
all 5 share the same source file:line (`src/routes/world-lore-entries.ts:68`) —
this is factory-built (createEntityRoutes), so the checker shows one line for the
literal registration. Verify the actual routes by reading the file.

## Summary

Wire the world lore-entries CRUD UI (GET list/GET per-item/PUT per-item/POST/DELETE).

## Backend surface (verify)

| Method | Path | File |
|--------|------|------|
| GET | `/api/worlds/:worldId/lore-entries` | `src/routes/world-lore-entries.ts:68` |
| GET | `/api/worlds/:worldId/lore-entries/:entityId` | `src/routes/world-lore-entries.ts:68` |
| POST | `/api/worlds/:worldId/lore-entries` | `src/routes/world-lore-entries.ts:68` |
| PUT | `/api/worlds/:worldId/lore-entries/:entityId` | `src/routes/world-lore-entries.ts:68` |
| DELETE | `/api/worlds/:worldId/lore-entries/:entityId` | `src/routes/world-lore-entries.ts:68` |

## Acceptance Criteria

- [ ] World dashboard exposes a "Lore Entries" tab
- [ ] List view + detail edit + create + delete
- [ ] Owner-only gate surfaced in UI
- [ ] Promote FE-BE gate advisory for factory-built routes to blocking once this slice lands
- [ ] `bun run check` green
