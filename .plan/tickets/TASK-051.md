<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-051: Item Durability System

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Item durability tracking — wear on use, repair paths, breakage thresholds.
**Context:** Mirrors crafting_station_instances durability contract.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, durability
**Epic**: epic-items
**Assignee**:

## Summary

Adds durability wear and tear to `world_items` instances: per-instance `currentDurability` decays on use (combat, crafting-station operation) and reaches zero at which point the item breaks or becomes inactive. Mirrors the existing `crafting_station_instances` durability contract (`max_durability`, `current_durability`, `is_active`) and extends it to player items.

## Context

- Existing precedent: `src/rpg/crafting/station-types.ts` exposes `maxDurability` / `currentDurability` on station instances; `src/rpg/crafting/stations.ts` writes `current_durability` on insert/update.
- Item shape: `ItemInstance` (`src/story/items/types.ts`) and `world_items` row currently lack durability fields.
- Drop path: `src/rpg/loot/persist.ts` builds `world_items` from `LootDrop`; durability defaults must flow through here.
- Use hook: combat (`src/rpg/combat/`) and crafting stations call `updateInstance`; durability decrement belongs alongside these calls.
- Upstream: depends on item-categories enum (`ItemCategory` in `src/db/enums-story/items.ts`) — durability only applies to non-stackable, non-consumable items.

## Acceptance Criteria

- `world_items` schema gains `current_durability int` and `max_durability int` (default 100 for non-stackable, NULL for stackable).
- `ItemsService.placeInLocation` / `giveToNpc` accept an optional `durability` override that flows into both columns.
- Combat damage and crafting-station operation call `decrementDurability(worldItemId, worldId, amount)` and return a `DurabilityResult` `{ remaining, broken }` (`src/story/items/instances.ts`).
- When `current_durability` reaches 0, the instance is marked `is_active = false` (or destroyed for one-shot consumables); verify in `instances.test.ts`.
- Existing `crafting_station_instances` durability contract is unchanged; new fields are additive on `world_items`.

## Related Files

- `src/story/items/instances.ts` *(existing)* — durability decrement entrypoint.
- `src/rpg/crafting/station-types.ts` *(existing)* — reference durability shape.
- `src/db/schema.ts` *(speculative)* — `world_items` migration adding durability columns.
- `src/rpg/loot/persist.ts` *(existing)* — default durability on drop.

## Notes

- Speculative migration is marked; verify schema column names with current `src/db/schema.ts` before adding.
- Repair flow (blacksmith/crafting action restores `current_durability`) is TBD — likely a sibling ticket under `epic-items-economy-crafting.md`.
- Durability and `ItemRarity.Unique` interact (legendary/unique items may be unbreakable); defer policy until epic lands.
