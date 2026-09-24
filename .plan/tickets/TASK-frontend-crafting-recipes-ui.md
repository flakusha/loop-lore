<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Crafting Recipes UI

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-crafting-professions
**Related:** TASK-wire-crafting-routes, TASK-persist-loot-drops
**Source:** FE-BE harmonization check, 2026-09-17 — 6 routes in this slice.

## Summary

Wire the crafting recipe CRUD UI. All recipe endpoints already exist on the
backend (recipes.ts, station-defs.ts, station-instances.ts, attempt.ts, orders.ts);
the web UI never adopted them.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/worlds/:worldId/recipes` | `src/routes/crafting/recipes.ts:65` |
| POST | `/api/worlds/:worldId/recipes` | `src/routes/crafting/recipes.ts:92` |
| GET | `/api/worlds/:worldId/recipes/:recipeId` | `src/routes/crafting/recipes.ts:134` |
| PUT | `/api/worlds/:worldId/recipes/:recipeId` | `src/routes/crafting/recipes.ts:151` |
| DELETE | `/api/worlds/:worldId/recipes/:recipeId` | `src/routes/crafting/recipes.ts:176` |
| PUT | `/api/worlds/:worldId/recipes/:recipeId/materials` | `src/routes/crafting/recipes.ts:193` |

## Acceptance Criteria

- [ ] World dashboard exposes a "Recipes" tab/panel
- [ ] List view with create form
- [ ] Detail view with edit + materials editor
- [ ] Delete with confirm
- [ ] Owner-only gate surfaced in UI
- [ ] `bun run check` green
