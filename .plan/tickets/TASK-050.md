<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-050: World ↔ Inventory Binding (Items-Domain Slice)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Items-scoped world binding — world_items scoped to world_id; cross-world IDOR prevention.
**Context:** Items-slice of world engine; full world engine lives in epic-world-locations.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, world, inventory
**Epic**: epic-items
**Assignee**:

## Summary

**Scope note:** title "World State Management" is mis-leading for this ticket — the full world state machine (exploration/settlement/dungeon transitions, location lifecycle) is tracked under `epic-world-locations.md` (`TASK-world-state-management.md`). **This ticket covers only the items-domain slice** of world binding: how `world_items` rows are scoped to a `world_id`, how location/actor ownership is enforced across `placeInLocation` / `giveToNpc` / `transfer`, and how cross-world IDOR is prevented. Cross-link `epic-world-locations.md` for the rest.

## Context

- Subsystem: `src/story/items/` (definitions, instances, npc-inventory) + `src/rpg/loot/persist.ts`.
- World scoping: every `world_items` row carries `world_id`; queries take `worldId` to prevent cross-world IDOR (`src/story/items/instances.ts`, `getDefinition` requires `worldId`).
- Ownership shapes: `placeInLocation(itemId, locationId, worldId, ...)`, `giveToNpc(itemId, actorId, worldId, ...)`, `transfer(worldItemId, worldId, quantity, toLocationId?, toActorId?)` (`src/story/items/index.ts`).
- Persistence: `ItemsService.destroy(worldItemId, worldId, ...)` and `transfer(..., trx?)` accept an optional `Transaction<DB>` for atomic multi-step inventory changes.
- Upstream: depends on world engine handing authoritative `worldId`; loot generation already uses `LootDestination.worldId` (`src/rpg/loot/persist.ts`).

## Acceptance Criteria

- `ItemsService.getDefinition(itemId, worldId)` returns the row only when both `id` and `world_id` match; mismatched `worldId` yields `null` (`src/story/items/definitions.ts`).
- `ItemsService.transfer(worldItemId, worldId, ...)` rejects (returns `success: false`) when the row's `world_id` does not match the supplied `worldId` (verify in `instances.test.ts`).
- `placeInLocation` and `giveToNpc` write `world_id` consistently; `getAtLocation` / `getNpcInventory` filter by the same scope.
- `getNpcInventoryBatch(actorIds)` returns a `Map<actorId, ItemInstance[]>` in one query (avoiding N+1 per `ItemsService.getNpcInventoryBatch`).
- Cross-world reads via the loot-persist bridge never leak `world_items` outside the destination `worldId`.

## Related Files

- `src/story/items/instances.ts` *(existing)* — `placeInLocation`, `giveToNpc`, `transfer`, `destroy`.
- `src/story/items/definitions.ts` *(existing)* — `getDefinition(worldId)` scoping.
- `src/rpg/loot/persist.ts` *(existing)* — `LootDestination.worldId` enforcement.
- `src/story/items/npc-inventory.ts` *(speculative)* — batch inventory helpers.

## Notes

- Cross-link `epic-world-locations.md` and `TASK-world-state-management.md` for the full world engine.
- IDOR guard contract is already enforced in `getDefinition`; verify the same guarantee on `transfer`/`destroy` paths.
- Multi-world transfers (move from world A to world B) are out of scope — items are world-scoped, not portable.
