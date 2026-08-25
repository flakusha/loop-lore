<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire Crafting Routes (Expose RecipesService via HTTP)

**Status:** ✅ Complete (2026-08-18 — all items including deferred)
**Priority:** P1 — High
**Effort:** Large
**Epic:** epic-item-systems-unification
**Tags:** crafting, recipes, routes, http, backend

## Summary

The crafting system has **8 DB tables** and a full `RecipesService` but **zero HTTP routes** — it's completely unreachable. This task exposes crafting CRUD operations via Elysia routes so the frontend and game systems can interact with recipes, stations, and crafting orders.

## Current State

| Table                        | Service               | Routes  |
| ---------------------------- | --------------------- | ------- |
| `crafting_recipes`           | ✅ `RecipesService`   | ✅ `recipes.ts` |
| `crafting_recipe_materials`  | ✅ via RecipesService | ✅ via recipes |
| `crafting_station_defs`      | ✅ `StationsService`  | ✅ `station-defs.ts` |
| `crafting_station_instances` | ✅ via StationsService| ✅ `station-instances.ts` |
| `professions`                | ❌ none               | ❌ none |
| `profession_specializations` | ❌ none               | ❌ none |
| `recipe_discoveries`         | ❌ none               | ❌ none |
| `crafting_attempts`          | ✅ `CraftingProcessService` | ✅ `attempt.ts` |
| `crafting_orders`            | ✅ `CraftingOrderService` | ✅ `orders.ts` |
| `gathering_node_defs`        | ❌ none               | ❌ none |
| `gathering_node_instances`   | ❌ none               | ❌ none |

## Acceptance Criteria

- [x] All recipe CRUD endpoints functional with validation
- [x] Crafting attempt consumes materials from actor inventory (via `CraftingProcessService.attemptCraft`)
- [x] Crafting attempt creates output item instance in actor inventory (same)
- [x] Station requirements enforced (must have station of correct type) (via `CraftingProcessService`)
- [x] Crafting orders can be placed and fulfilled (payment transferred) (via `CraftingOrderService` + `TradeService.trade`)
- [x] All endpoints ownership-gated (world owner/admin)
- [x] `bun test src/` green; `bun run check` green
- [x] OpenAPI docs generated for all endpoints (Elysia `detail` tags)

## Notes (impl 2026-08-12)

- **Recipes CRUD wired:** `src/routes/crafting/recipes.ts` — `GET/POST /api/worlds/:worldId/recipes`, `GET/PUT/DELETE .../recipes/:recipeId`, `PUT .../recipes/:recipeId/materials`. Backed by `RecipesService` (src/rpg/crafting). Registered in `register-plugins.ts`.
- 8 new integration tests (`src/routes/crafting.test.ts`) over a real test DB + auth stub; full suite 3452 pass / 0 fail; typecheck + frontend + coverage green.
- Ownership gate checks `worlds.owner_id === userId`.

## Notes (deferred items closed 2026-08-18)

- **Stations, attempts, orders** wired in worktree `feature/a8-unwired-closeout` (commit `a7ffbb70`).
- `StationsService` CRUD + `CraftingProcessService` + `CraftingOrderService` all implemented in `src/rpg/crafting/`.
- Station/attempt/order routes: `station-defs.ts` + `station-instances.ts` + `attempt.ts` + `orders.ts`, all under 250L (size gate).
- See `TASK-crafting-stations-execution.md` for full implementation details.
- `crafting_orders` table pre-existed (no migration needed); IS3 needed only service + routes.

## Files to Create

- `src/routes/crafting/recipes.ts` — recipe CRUD routes
- `src/routes/crafting/stations.ts` — station routes (barrel)
- `src/routes/crafting/station-defs.ts` — station definition CRUD
- `src/routes/crafting/station-instances.ts` — station instance CRUD
- `src/routes/crafting/attempt.ts` — crafting execution
- `src/routes/crafting/orders.ts` — economy orders
- `src/routes/crafting/index.ts` — barrel export
- `src/rpg/crafting/orders.ts` — CraftingOrderService

## Related

- `epic-crafting-professions.md` — existing crafting epic (DB layer done)
- `TASK-implement-trade.md` — crafting orders are trade primitives
- `TASK-persist-loot-drops.md` — crafting output should persist like loot
- `TASK-unify-item-types.md` — crafting uses item types


git issue: a2a2669
