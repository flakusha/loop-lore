<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Crafting Stations UI (defs + instances)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-crafting-professions
**Related:** TASK-wire-crafting-routes, TASK-crafting-stations-execution
**Source:** FE-BE harmonization check, 2026-09-17 — 8 routes in this slice.

## Summary

Wire the crafting-station definition + instance CRUD UI. Backend endpoints are
complete (`station-defs.ts`, `station-instances.ts`); web UI has no caller.

## Backend surface

| Method | Path | File |
|--------|------|------|
| POST | `/api/worlds/:worldId/crafting-stations` | `src/routes/crafting/station-defs.ts:105` |
| GET | `/api/worlds/:worldId/crafting-stations` | `src/routes/crafting/station-defs.ts:144` |
| GET | `/api/worlds/:worldId/crafting-stations/:stationDefId` | `src/routes/crafting/station-defs.ts:162` |
| PUT | `/api/worlds/:worldId/crafting-stations/:stationDefId` | `src/routes/crafting/station-defs.ts:177` |
| DELETE | `/api/worlds/:worldId/crafting-stations/:stationDefId` | `src/routes/crafting/station-defs.ts:204` |
| POST | `/api/worlds/:worldId/crafting-stations/:stationDefId/instances` | `src/routes/crafting/station-instances.ts:62` |
| GET | `/api/worlds/:worldId/crafting-stations/:stationDefId/instances` | `src/routes/crafting/station-instances.ts:97` |
| GET | `/api/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId` | `src/routes/crafting/station-instances.ts:113` |
| PUT | `/api/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId` | `src/routes/crafting/station-instances.ts:130` |
| DELETE | `/api/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId` | `src/routes/crafting/station-instances.ts:154` |

## Acceptance Criteria

- [ ] World dashboard exposes a "Crafting Stations" tab
- [ ] Defs list + create/edit/delete
- [ ] Instances list + create/edit/delete per def
- [ ] Owner-only gates surfaced in UI
- [ ] `bun run check` green
