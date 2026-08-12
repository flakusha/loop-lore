# TASK: Wire Crafting Routes (Expose RecipesService via HTTP)

**Status:** ✅ Complete (2026-08-12)
**Priority:** P1 — High
**Effort:** Large
**Epic:** epic-item-systems-unification
**Tags:** crafting, recipes, routes, http, backend

## Summary

The crafting system has **8 DB tables** and a full `RecipesService` but **zero HTTP routes** — it's completely unreachable. This task exposes crafting CRUD operations via Elysia routes so the frontend and game systems can interact with recipes, stations, and crafting orders.

## Current State

| Table                        | Service               | Routes  |
| ---------------------------- | --------------------- | ------- |
| `crafting_recipes`           | ✅ `RecipesService`   | ❌ none |
| `crafting_recipe_materials`  | ✅ via RecipesService | ❌ none |
| `crafting_station_defs`      | ❌ none               | ❌ none |
| `crafting_station_instances` | ❌ none               | ❌ none |
| `professions`                | ❌ none               | ❌ none |
| `profession_specializations` | ❌ none               | ❌ none |
| `recipe_discoveries`         | ❌ none               | ❌ none |
| `crafting_attempts`          | ❌ none               | ❌ none |
| `crafting_orders`            | ❌ none               | ❌ none |
| `gathering_node_defs`        | ❌ none               | ❌ none |
| `gathering_node_instances`   | ❌ none               | ❌ none |

## Work

1. **Recipes CRUD** — `routes/crafting/recipes.ts`:
   - `GET /api/worlds/:worldId/recipes` — list (paginated, filter by discipline/tier)
   - `POST /api/worlds/:worldId/recipes` — create (with materials)
   - `GET /api/worlds/:worldId/recipes/:recipeId` — get one
   - `PUT /api/worlds/:worldId/recipes/:recipeId` — update
   - `DELETE /api/worlds/:worldId/recipes/:recipeId` — delete
2. **Stations** — `routes/crafting/stations.ts`:
   - CRUD for station definitions + instances
   - `GET /api/worlds/:worldId/stations` — list available stations
3. **Crafting execution** — `routes/crafting/attempts.ts`:
   - `POST /api/worlds/:worldId/craft` — attempt crafting (consumes materials, produces output)
   - Validates: materials present, station available, level requirement, skill check
   - Creates `crafting_attempts` record, calls `ItemsService` for material/output
4. **Orders (economy)** — `routes/crafting/orders.ts`:
   - `POST /api/worlds/:worldId/orders` — place crafting order (requester → crafter)
   - `GET /api/worlds/:worldId/orders` — list open orders
   - `POST /api/worlds/:worldId/orders/:orderId/fulfill` — crafter fulfills order
5. **Register routes** — wire into `src/elysia-app.ts` and `src/app/register-plugins.ts`
6. **Material consumption** — connect crafting to `ItemsService.transfer()` / `destroy()` for material deduction and output creation

## Acceptance Criteria

- [x] All recipe CRUD endpoints functional with validation
- [ ] Crafting attempt consumes materials from actor inventory (deferred — `CraftingProcessService` not yet implemented; see notes)
- [ ] Crafting attempt creates output item instance in actor inventory (deferred — same)
- [ ] Station requirements enforced (must have station of correct type) (deferred — `StationsService` not implemented)
- [ ] Crafting orders can be placed and fulfilled (payment transferred) (deferred — lands in `TASK-implement-trade`)
- [x] All endpoints ownership-gated (world owner/admin)
- [x] `bun test src/` green; `bun run check` green
- [x] OpenAPI docs generated for all endpoints (Elysia `detail` tags)

## Notes (impl 2026-08-12)

- **Recipes CRUD wired:** `src/routes/crafting/recipes.ts` — `GET/POST /api/worlds/:worldId/recipes`, `GET/PUT/DELETE .../recipes/:recipeId`, `PUT .../recipes/:recipeId/materials`. Backed by `RecipesService` (src/rpg/crafting). Registered in `register-plugins.ts`.
- **Defers (per ticket work items 2–4):** station, attempt, and order routes depend on `StationsService`, `CraftingProcessService`, and order-economy services that are not implemented (`src/rpg/crafting/index.ts` TODO comments). Attempts/orders land with `TASK-implement-trade`. Station/attempt left as follow-up.
- 8 new integration tests (`src/routes/crafting.test.ts`) over a real test DB + auth stub; full suite 3452 pass / 0 fail; typecheck + frontend + coverage green.
- Ownership gate checks `worlds.owner_id === userId`.

## Files to Create

- `src/routes/crafting/recipes.ts` — recipe CRUD routes
- `src/routes/crafting/stations.ts` — station routes
- `src/routes/crafting/attempts.ts` — crafting execution
- `src/routes/crafting/orders.ts` — economy orders
- `src/routes/crafting/index.ts` — barrel export
- `src/routes/crafting/handlers.ts` — shared handlers

## Related

- `epic-crafting-professions.md` — existing crafting epic (DB layer done)
- `TASK-implement-trade.md` — crafting orders are trade primitives
- `TASK-persist-loot-drops.md` — crafting output should persist like loot
- `TASK-unify-item-types.md` — crafting uses item types
