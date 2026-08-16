<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Crafting Stations & Execution (stations CRUD + `POST /craft` + orders)

**Status:** open
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

## Current State

- ✅ Recipe CRUD routes shipped (`src/routes/crafting/recipes.ts`)
- ⬜ `StationsService` — no CRUD, no `GET /stations`
- ⬜ `CraftingProcessService` — no attempt execution
- ⬜ No `POST /craft`, no orders place/fulfill endpoint

## Work

- Stations: `StationsService` CRUD + `GET /api/crafting/stations` (world-scoped)
- Attempts: `POST /api/crafting/craft` — consume materials from actor inventory →
  produce output instance in actor inventory; success/skill/level checks; station-type
  requirement enforced
- Orders: place/fulfill crafting orders via HTTP with payment transfer (currency ledger
  from `TASK-implement-trade.md` as backbone)
- Ownership gates: world owner/admin for mutations; actor-only for own attempts

## Acceptance Criteria

- [ ] Station CRUD endpoints functional with validation; `GET /stations` returns world-scoped list
- [ ] `POST /craft` consumes materials and creates output item instance (quantity CHECK respected)
- [ ] Station-type requirements enforced on attempt
- [ ] Crafting orders place/fulfill lifecycle works; payment transferred via currency ledger
- [ ] All endpoints ownership-gated (world owner/admin)
- [ ] `bun test src/` green; `bun run check` green
- [ ] OpenAPI docs generated for all endpoints

## Files to Create

- `src/routes/crafting/stations.ts` — station routes
- `src/routes/crafting/attempts.ts` — crafting execution
- `src/routes/crafting/orders.ts` — economy orders
- `src/routes/crafting/index.ts` — barrel export (wire into `elysia-app.ts`)
- Service gaps filled in `src/rpg/crafting/` (StationsService, CraftingProcessService)

## Related

- `epic-item-systems-unification.md` — Remaining Points #1–3
- `epic-rpg-wiring-phase3.md` — parent epic
- `TASK-wire-crafting-routes.md` — recipe CRUD landed subset
