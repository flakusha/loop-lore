# TASK: Link NPC Inventory to World Items (Replace Denormalized JSON)

**Status:** ⬜ Not Started
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
4. **Migration** — `031_link_npc_inventory.ts`:
   - Backfill: parse existing `inventory` JSON arrays, match names to `items` table, create `world_items` rows with `owner_actor_id`
   - Keep `npc_states.inventory` column for backward compat but mark deprecated (or drop after backfill)
5. **Update GM prompt** — `gm/decisions/hardcoded.ts:16-17` already reads `npcState.inventory` — update to use resolved item names from `ItemInstance[]`
6. **Update `world-state/context.ts`** — replace `jsonParseOr(npcRow.inventory, [])` with `ItemsService.getNpcInventory(actorId)`

## Acceptance Criteria

- [ ] `ItemsService.giveToNpc()` is the only way to add items to NPC inventory
- [ ] `npc_states.inventory` column deprecated (or removed)
- [ ] `NpcState.inventory` type is `ItemInstance[]` (id, name, quantity, etc.)
- [ ] GM prompt shows item names from resolved `ItemInstance` records
- [ ] Migration backfills existing NPC inventories to `world_items`
- [ ] No data loss: all existing NPC items have corresponding `world_items` rows
- [ ] `bun test src/` green; `bun run check` green

## Files to Modify

- `src/story/story-events-types.ts` — update `NpcState.inventory` type
- `src/story/world-state/context.ts` — use `ItemsService.getNpcInventory()`
- `src/story/gm/decisions/hardcoded.ts` — update prompt assembly
- `src/story/items/index.ts` — ensure `giveToNpc()` is idempotent
- `src/db/migrations/031_link_npc_inventory.ts` — new migration
- `src/db/schema-story.ts` — deprecate `npc_states.inventory` column

## Related

- `TASK-unify-item-types.md` — depends on unified ItemInstance type
- `TASK-implement-trade.md` — NPC inventory needed for trading
- `TASK-implement-item-transfer-event.md` — item transfers affect NPC inventory
