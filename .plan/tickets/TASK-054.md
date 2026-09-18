<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-054: Unique Item Tracking

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Per-world uniqueness tracking; at most one instance of a unique-def item per world.
**Context:** Cross-world uniqueness not enforced (consistent with TASK-050).
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, unique
**Epic**: epic-items
**Assignee**:

## Summary

Tracks world-unique items (one-of-a-kind artifacts, quest items, legendary weapons) by enforcing at most one `world_items` row per unique `itemId` per `worldId`. Reuses `ItemRarity.Unique` / `StackableState.Unique` as the gating signal; surfaces a `UniqueItemRegistry` lookup so quest/story code can resolve "is this the only copy in the world?".

## Context

- Existing enum: `ItemRarity.Unique = "unique"` and `StackableState.Unique` (`src/db/enums-story/items.ts`, `src/db/enums.ts`).
- Persist path: `src/rpg/loot/persist.ts` creates one `world_items` row per drop call; uniqueness check must run before insert.
- Definition shape: `ItemDefinition.stackable` already maps to `StackableState.Unique` for non-stackable items (`src/story/items/definitions.ts`).
- Rarity weights: `src/rpg/loot/weights.ts` weights `unique` and `artifact` rarities at low probability.
- Upstream: depends on `world_id` scoping (TASK-050) and stackable dispatch (TASK-049 ledger slice).

## Acceptance Criteria

- A new unique item (`stackable === StackableState.Unique` and rarity `unique`/`artifact`) is rejected at `ItemsService.giveToNpc` / `placeInLocation` if a `world_items` row already exists for the same `itemId` in the same `worldId`.
- Rejection returns a typed `UniqueItemAlreadyExistsError` carrying the existing `worldItemId` for callers that want to "transfer" rather than "drop".
- `getUniqueItem(itemId, worldId)` returns the single `world_items` row or `null`.
- Loot generation flags drops whose rarity is `unique`/`artifact` so `persistLootDrops` can short-circuit duplicates before insert (`src/rpg/loot/persist.ts`).
- Cross-world uniqueness is **not** enforced: each `worldId` has its own copy of any unique item (consistent with TASK-050 scoping).

## Related Files

- `src/story/items/instances.ts` *(existing)* — uniqueness guard in `placeInLocation` / `giveToNpc`.
- `src/rpg/loot/persist.ts` *(existing)* — pre-insert dedupe.
- `src/db/enums-story/items.ts` *(existing)* — `ItemRarity.Unique`, `StackableState.Unique`.
- `src/story/items/unique-registry.ts` *(speculative)* — `getUniqueItem` helper.

## Notes

- Speculative items are marked; verify against current `src/story/items/` before implementation.
- Quest items already use `ItemCategory.QuestItem`; this ticket layers uniqueness on top.
- "Hand-off" semantics when a unique item is destroyed: should the game allow a re-drop? Default **no**; revisit if balance demands it.
