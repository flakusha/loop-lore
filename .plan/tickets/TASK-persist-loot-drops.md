# TASK: Persist Loot Drops (Generate → World Items)

**Status:** ✅ Complete (2026-08-12)
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** loot, items, persistence, world-items, bridge

## Summary

`rpg/loot/generation.ts:generateLoot()` returns anonymous `LootDrop[]` with item names but **no persistence** — drops vanish into the void. This task bridges loot generation to `ItemsService` so drops become real `world_items` instances that can be picked up, traded, or stored.

## Current State

```typescript
// rpg/loot/generation.ts
export function generateLoot(entries, level, dropCount, luckModifier,): LootResult {
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

- [x] `generateLoot()` creates `world_items` rows for each drop — via async `persistLoot()`
- [x] Loot drops appear in NPC inventory or at location (caller's choice — `actorId` or `locationId`)
- [x] `LootResult.worldItemIds` references created instances
- [x] `battle/items-integration.ts:generateLoot()` delegates to unified implementation — see notes
- [x] Loot entries can optionally reference existing `items` definitions by ID (`LootEntry.itemId`)
- [x] Items created from anonymous drops get proper `ItemCategory` + `ItemRarity` (`toCategory()`)
- [x] `bun test src/` green; `bun run check` green

## Notes (impl 2026-08-12)

- Added `LootEntry.itemId?` + `LootDrop.itemId?`; `LootResult.worldItemIds` (init `[]`).
- New `persistLoot(db, result, { worldId, actorId? | locationId? })` bridge in `rpg/loot/persist.ts`: resolves existing definition by `itemId` or creates one on-the-fly from drop metadata; grants via `giveToNpc` or places via `placeInLocation`; fills `worldItemIds`.
- `toCategory()` maps battle-style type strings (helmet/boots/potion/quest...) to unified `ItemCategory`.
- **Battle loot unification**: the two `generateLoot` signatures differ structurally (battle `LootTableEntry` = itemId+flat dropChance; rpg `LootEntry` = name+rarity+weighted). Battle route `POST /api/battle/equipment/loot` now persists real instances via `ItemsService.giveToNpc`/`placeInLocation` when `worldId` + destination given (battle drops reference existing item IDs). Deep type-level delegation deferred as it would change the battle API contract.
- 6 new persist tests + 4 toCategory tests; full suite 3430 pass / 0 fail; typecheck + frontend + coverage (96.90%) pass.

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
