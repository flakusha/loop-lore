<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-049: Quest Reward / Item Ledger (Items-Domain Slice)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Quest reward ledger — persist LootDrop[] as world_items; reconcile stackable vs unique.
**Context:** Items-slice of quest lifecycle; full quest engine lives in epic-rpg-content-systems.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, quests, ledger
**Epic**: epic-items
**Assignee**:

## Summary

**Scope note:** title "Quest State Management" is mis-leading for this ticket — the full quest state machine (objectives, transitions, integration with battle/trading) is tracked under `epic-rpg-content-systems.md` (`TASK-quest-state-management.md`). **This ticket covers only the items-domain slice** of quest lifecycle: the quest reward ledger that persists `LootDrop[]` as `world_items` instances and reconciles stackable vs unique reward semantics. Cross-link `epic-rpg-content-systems.md` for the rest.

## Context

- Subsystem: `src/rpg/loot/` (types, generation, persist, table) + `src/story/items/` (definitions, instances, npc-inventory).
- Anchor call: `persistLootDrops(db, drops, destination)` in `src/rpg/loot/persist.ts` turns generated `LootDrop[]` into `world_items` rows via `ItemsService`.
- Types: `LootResult`, `LootDrop`, `LootEntry` in `src/rpg/loot/types.ts`; `ItemDefinition`, `ItemInstance`, `ItemCategory`, `ItemRarity` in `src/story/items/types.ts` and `src/db/enums-story/items.ts`.
- Stackable dispatch: `ItemDefinition.stackable` → `StackableState.Stackable` vs `StackableState.Unique` (`src/story/items/definitions.ts`).
- Upstream: depends on quest engine handing in `LootEntry[]` with `itemId` for known items; anonymous drops are auto-defined on-the-fly via `LOOSE_TYPE_TO_CATEGORY` (`src/rpg/loot/persist.ts`).

## Acceptance Criteria

- Quest reward drops with `entry.itemId` resolve to the matching `items.id` (world-scoped) and create exactly one `world_items` row per drop call (verify in `src/rpg/loot/persist.test.ts`).
- Anonymous drops call `ItemsService.createDefinition` then `placeInLocation` / `giveToNpc` per `LootDestination` (`src/rpg/loot/persist.ts`).
- `LootDrop.quantity` respects `ItemDefinition.maxStack` for stackable items and stays at 1 for unique items.
- Reward ledger is recoverable: re-running persist on the same `LootResult` does not double-credit (idempotency contract TBD).
- Failed persist writes roll back any partial `world_items` rows; transaction boundary lives at `ItemsService.transfer`/`destroy` (`src/story/items/instances.ts`).

## Related Files

- `src/rpg/loot/persist.ts` *(existing)* — bridge from `LootDrop[]` to `world_items`.
- `src/rpg/loot/types.ts` *(existing)* — `LootDrop`, `LootResult`, `LootEntry`.
- `src/story/items/index.ts` *(speculative)* — ledger-side wrappers around `ItemsService`.
- `src/db/enums-story/items.ts` *(existing)* — canonical `ItemCategory` / `ItemRarity`.

## Notes

- Cross-link `epic-rpg-content-systems.md` and `TASK-quest-state-management.md` for the full quest engine.
- Ledger idempotency strategy (idempotency-key vs event-id dedupe) is still TBD — coordinate with quest engine.
- "Quest item" categories already exist (`ItemCategory.QuestItem`); no schema migration needed for the items slice.
