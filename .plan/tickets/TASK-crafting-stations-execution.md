<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Crafting Stations & Execution (stations CRUD + `POST /craft` + orders)

**Status:** ✅ Complete (2026-08-18)
**Priority:** high
**Labels:** rpg, crafting, routes
**Assignee**:
**Epic:** epic-rpg-wiring-phase3.md
**Related:** TASK-wire-crafting-routes.md, TASK-complete-crafting-system-services.md

## Summary

The crafting backend landed in worktree `rpg-wire-routes` (2026-08-12) exposes **recipe
CRUD only**. Deferred from `TASK-wire-crafting-routes.md` and
`epic-item-systems-unification.md` "Remaining Points" #1–3: station management, crafting
attempt execution, and crafting orders over HTTP. The DB already has the tables
(`crafting_stations`, `crafting_attempts`, `crafting_orders` family) and
`RecipesService` exists.

Closed in worktree `feature/a8-unwired-closeout` (2026-08-18, commit `a7ffbb70`).

## Current State

- ✅ Recipe CRUD routes shipped (`src/routes/crafting/recipes.ts`)
- ✅ `StationsService` CRUD + `GET /stations` — `station-defs.ts` (5 def routes) + `station-instances.ts` (5 instance routes), barrel in `stations.ts`
- ✅ `CraftingProcessService` — attempt execution wired via `attempt.ts`
- ✅ `POST /craft` + attempts list/detail endpoints
- ✅ Crafting orders place/accept/fulfill/cancel via `orders.ts` backed by `CraftingOrderService` (payment through `TradeService`)

## Acceptance Criteria

- [x] Station CRUD endpoints functional with validation; `GET /stations` returns world-scoped list
- [x] `POST /craft` consumes materials and creates output item instance (quantity CHECK respected)
- [x] Station-type requirements enforced on attempt (via `CraftingProcessService.attemptCraft`)
- [x] Crafting orders place/fulfill lifecycle works; payment transferred via `TradeService.trade`
- [x] All endpoints ownership-gated (world owner/admin via `resolveWorldOwner`; actor via `resolveActorAccess`)
- [x] `bun test src/routes/crafting/` green (20/20 pass)
- [x] OpenAPI docs generated for all endpoints (Elysia `detail` tags)

## Files Created

- `src/routes/crafting/station-defs.ts` — station definition CRUD (187L)
- `src/routes/crafting/station-instances.ts` — station instance CRUD (146L)
- `src/routes/crafting/stations.ts` — barrel (24L, `.use()`s both sub-plugins)
- `src/routes/crafting/attempt.ts` — `POST /craft` + list/detail (152L)
- `src/routes/crafting/orders.ts` — order place/accept/fulfill/cancel (186L)
- `src/rpg/crafting/orders.ts` — `CraftingOrderService` (165L)
- `src/routes/crafting/stations.test.ts` — station route tests
- `src/routes/crafting/attempt.test.ts` — attempt route tests
- `src/routes/crafting/orders.test.ts` — order route tests
- `src/app/register-plugins.ts` — wires all crafting sub-routes

## Implementation Notes (2026-08-18)

- `stations.ts` split from385L to ≤250L per file (size gate) via defs/instances separation.
- `resolveWorldOwner` helper exported from `station-defs.ts`, imported by `station-instances.ts`.
- `CraftingOrderService.fulfillOrder` runs `attemptCraft` then `TradeService.trade` for payment.
- Orders route gated by actor ownership (`resolveActorAccess`); stations by world ownership.
- `orders.ts` service uses `Array.from(rows, fn)` mapping (not `.map()` or `for-of+push` — lint pair).

## Related

- `epic-item-systems-unification.md` — Remaining Points #1–3
- `epic-rpg-wiring-phase3.md` — parent epic
- `TASK-wire-crafting-routes.md` — recipe CRUD landed subset


git issue: 1fead82
