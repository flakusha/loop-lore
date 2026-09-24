<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Crafting Attempts UI (execute + history)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-crafting-professions
**Related:** TASK-wire-crafting-routes, TASK-persist-loot-drops
**Source:** FE-BE harmonization check, 2026-09-17 — 3 routes in this slice.

## Summary

Wire the crafting-execution surface (POST a craft attempt + list/inspect attempts
per actor). Backend endpoints exist; web UI has no caller.

## Backend surface

| Method | Path | File |
|--------|------|------|
| POST | `/api/worlds/:worldId/craft` | `src/routes/crafting/attempt.ts:73` |
| GET | `/api/worlds/:worldId/actors/:actorId/craft-attempts` | `src/routes/crafting/attempt.ts:106` |
| GET | `/api/worlds/:worldId/craft-attempts/:attemptId` | `src/routes/crafting/attempt.ts:127` |

## Acceptance Criteria

- [ ] Recipe detail page exposes "Craft" button → POSTs attempt
- [ ] Actor sheet / character panel lists attempts history
- [ ] Attempt detail modal shows progress + outcome
- [ ] Optimistic UI update; outcome rendered from response
- [ ] `bun run check` green
