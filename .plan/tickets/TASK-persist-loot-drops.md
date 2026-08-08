# TASK: Persist Loot Drops (Generate → World Items)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** loot, items, persistence, world-items, bridge

## Summary

`rpg/loot/generation.ts:generateLoot()` returns anonymous `LootDrop[]` with item names but **no persistence** — drops vanish into the void. This task bridges loot generation to `ItemsService` so drops become real `world_items` instances that can be picked up, traded, or stored.

## Current State

```typescript
// rpg/loot/generation.ts
export function generateLoot(entries, level, dropCount, luckModifier): LootResult {
  // Returns { drops: LootDrop[], totalGoldValue, hasRareDrop }
  // LootDrop = { name, type, rarity, quantity, goldValue, metadata }
  // ❌ No item_id, no world_items row created
}
```

## Work

1. **Link loot entries to item definitions** — add optional `itemId` field to `LootEntry` (when drop should map to a real item definition)
2. **Post-generation persistence** — after `generateLoot()`, for each drop:
   - If `entry.itemId` exists → `ItemsService.giveToNpc(itemId, actorId, worldId, quantity)` or `placeInLocation()`
   - If no `entry.itemId` → create item definition on-the-fly from drop metadata (name, type, rarity) then place
3. **Unify loot systems** — consolidate `battle/items-integration.ts:generateLoot()` (flat % chance) with `rpg/loot/generation.ts` (weighted, level-scaled). Keep one implementation, make the other call it.
4. **Return enriched result** — `LootResult` includes `worldItemIds: string[]` so callers can reference placed items
5. **Battle integration** — `routes/battle/equipment.ts` loot endpoint should call the unified generator + persist

## Acceptance Criteria

- [ ] `generateLoot()` creates `world_items` rows for each drop
- [ ] Loot drops appear in NPC inventory or at location (caller's choice)
- [ ] `LootResult.worldItemIds` references created instances
- [ ] `battle/items-integration.ts:generateLoot()` delegates to unified implementation
- [ ] Loot entries can optionally reference existing `items` definitions by ID
- [ ] Items created from anonymous drops get proper `ItemCategory` + `ItemRarity`
- [ ] `bun test src/` green; `bun run check` green

## Files to Modify

- `src/rpg/loot/generation.ts` — add persistence step
- `src/rpg/loot/types.ts` — add `itemId?` to `LootEntry`, `worldItemIds` to `LootResult`
- `src/battle/items-integration.ts` — delegate to unified generator
- `src/routes/battle/equipment.ts` — update loot endpoint

## Related

- `TASK-unify-item-types.md` — loot uses unified types
- `TASK-link-npc-inventory.md` — loot can grant to NPCs
- `TASK-wire-crafting-routes.md` — crafting output uses same pattern
- `epic-item-system-extensions.md` — loot tables for unique items
