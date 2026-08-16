<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Link NPC Inventory to World Items (Replace Denormalized JSON)

**Status:** ✅ Complete (2026-08-12)
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, npc, inventory, world-items, refactor

## Summary

Replace the denormalized `npc_states.inventory` (JSON string array of item names) with proper `world_items.owner_actor_id` references. Currently NPC inventory is a dumb string list — the GM prompt sees "Carrying: Sword, Potion" but there's no link to actual item definitions, no quantity tracking, and no way to transfer/trade.

## Current State

```typescript
// story/story-events-types.ts
interface NpcState {
  inventory: string[];  // ← just names, no IDs, no quantities
  ...
}

// story/world-state/context.ts:117
inventory: jsonParseOr(npcRow.inventory, []),
```

## Work

1. **Stop writing to `npc_states.inventory`** — new item grants use `ItemsService.giveToNpc()` which sets `world_items.owner_actor_id`
2. **Add view/query** — `getNpcInventory(actorId)` already exists in `ItemsService` (returns `world_items` joined with `items`)
3. **Update `NpcState` type** — replace `inventory: string[]` with `inventory: ItemInstance[]` (or derive on read)
4. **Schema (inline, no new migration)** — DB is reinit, so no backfill needed. Keep `npc_states.inventory` column in `parts/007_story_generation.ts` but mark it deprecated (drop is optional — safe to keep). All NPC items live in `world_items.owner_actor_id` from creation.
5. **Update GM prompt** — `gm/decisions/hardcoded.ts:16-17` already reads `npcState.inventory` — update to use resolved item names from `ItemInstance[]`
6. **Update `world-state/context.ts`** — replace `jsonParseOr(npcRow.inventory, [])` with `ItemsService.getNpcInventory(actorId)`

## Acceptance Criteria

- [x] `ItemsService.giveToNpc()` is the only way to add items to NPC inventory
- [x] `npc_states.inventory` column deprecated (or removed)
- [x] `NpcState.inventory` type is `ItemInstance[]` (id, name, quantity, etc.)
- [x] GM prompt shows item names from resolved `ItemInstance` records
- [x] No backfill needed (DB reinit); `npc_states.inventory` column deprecated only
- [x] `bun test src/` green; `bun run check` green

## Notes (impl 2026-08-12)

- `NpcState.inventory: string[]` → `ItemInstance[]` (imported type from `story/items/types`).
- `getNpcInventory()` typed `Promise<ItemInstance[]>`, aliases `world_items`+`items` joins to `ItemInstance` shape (adds `visibility`, parses `properties` via `jsonParseOr`, coerces nullable `description`).
- `world-state/context.ts` builds one `ItemsService` and calls `getNpcInventory(actorId)` per NPC — no longer reads `npc_states.inventory`.
- GM `hardcoded.ts` renders names with quantity suffix (`Sword×2`).
- Legacy `npc_states.inventory` column: no longer written by `world-state/init.ts` (relies on default); removed from mutable JSON fields in `routes/story-states/handlers.ts`; migration comment notes it's kept for reinit compat.
- `ActorItemType` fully **removed** (not just deprecated) from `flags.ts`, `enums.test.ts`, `enums.ts` doc, `primitives.ts`; `column-types.ts` maps `item_type` → `ItemCategory` (from previous task).
- Verified: `db:schemas:check` green, full suite 3402 pass / 0 fail, typecheck + frontend + coverage (96.92%) pass.

## Files to Modify

- `src/story/story-events-types.ts` — update `NpcState.inventory` type
- `src/story/world-state/context.ts` — use `ItemsService.getNpcInventory()`
- `src/story/gm/decisions/hardcoded.ts` — update prompt assembly
- `src/story/items/index.ts` — ensure `giveToNpc()` is idempotent
- `src/db/migrations/parts/007_story_generation.ts` — keep `npc_states.inventory` column, mark deprecated (inline)
- `src/db/schema-story.ts` — deprecate `npc_states.inventory` column

## Related

- `TASK-unify-item-types.md` — depends on unified ItemInstance type
- `TASK-implement-trade.md` — NPC inventory needed for trading
- `TASK-implement-item-transfer-event.md` — item transfers affect NPC inventory
