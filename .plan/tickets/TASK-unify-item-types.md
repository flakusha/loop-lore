<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Unify Item Type Taxonomies

**Status:** ✅ Complete (2026-08-12)
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, types, enums, refactor, unification

## Summary

Consolidate **4 divergent item type taxonomies** into a single canonical system. Currently `ItemCategory` (11 vals), `ActorItemType` (5 vals), `ItemQuality` (5 vals), and `Rarity` (5 tiers in loot vs 6 in items) are incompatible — items can't flow between systems.

## Current Taxonomies

| Taxonomy        | File                          | Values                                                                                            | Used By                       |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| `ItemCategory`  | `enums-story/items.ts`        | weapon, armor, consumable, key_item, quest_item, material, tool, container, treasure, book, other | `items` table, `ItemsService` |
| `ActorItemType` | `enums-core/flags.ts`         | equipment, consumable, key_item, artifact, misc                                                   | `actor_items` table           |
| `ItemQuality`   | `battle/items-integration.ts` | common, uncommon, rare, epic, legendary                                                           | `EquipmentItem`               |
| `Rarity` (loot) | `rpg/loot/types.ts`           | common, uncommon, rare, legendary, artifact                                                       | Loot generation               |
| `ItemRarity`    | `enums-story/items.ts`        | common, uncommon, rare, epic, legendary, unique                                                   | `items` table                 |

## Work

1. **Canonical enums** — extend `ItemCategory` and `ItemRarity` to cover all use cases:
   - `ItemCategory`: add `artifact`, `misc` (already has `other` → consolidate)
   - `ItemRarity`: add `artifact` (already has 6 tiers, loot uses 5 → map `artifact` → `unique` or add it)
2. **Deprecate `ActorItemType`** — migrate `actor_items.item_type` to use `ItemCategory` (or keep as alias with CHECK constraint)
3. **Deprecate `ItemQuality`** — replace with `ItemRarity` in `EquipmentItem` interface
4. **Align loot `Rarity`** — use `ItemRarity` from `enums-story/items.ts` in `rpg/loot/types.ts`
5. **Schema (inline, no new migration)** — DB is reinit, so edit the existing migration that creates the table:
   - `parts/003_worlds.ts` — extend `items` table: add CHECK constraint on `category`/`rarity` enforcing unified `ItemCategory`/`ItemRarity` values (incl. `artifact` tier)
   - `parts/005_actor_data.ts` — `actor_items.item_type`: add CHECK constraint against unified `ItemCategory` values; no backfill needed (reinit)

## Acceptance Criteria

- [x] Single `ItemCategory` enum used everywhere (actor_items, items, loot, battle)
- [x] Single `ItemRarity` enum with tiers: common, uncommon, rare, epic, legendary, unique, artifact
- [x] `ActorItemType` marked deprecated (JSDoc @deprecated) or removed
- [x] `ItemQuality` marked deprecated (JSDoc @deprecated) or removed
- [x] Loot `Rarity` type aliases to `ItemRarity`
- [x] `EquipmentItem.quality` → `rarity: ItemRarity`
- [x] `items` + `actor_items` carry CHECK constraints over unified enums (artifact tier included)
- [x] All existing tests pass; `bun run check` green

## Notes (impl 2026-08-12)

- `ItemCategory` extended: added `artifact`, `misc` (kept `other` — frontend default + handlers use it).
- `ItemRarity` extended: added `artifact` (7 tiers).
- `ActorItemType` kept as deprecated alias in `enums-core/flags.ts`; `column-types.ts` now maps `actor_items.item_type` → `ItemCategory`; regenerated `schema-core.ts`/`insert-helpers.ts`/`validation/db-schemas.ts` via `db:sync-types`.
- Battle `ItemQuality` removed; `EquipmentItem.rarity: ItemRarity`; `calculateSellPrice` uses 7-tier multipliers.
- Loot `Rarity` aliases `ItemRarity`; `weights.ts` covers all 7 tiers (added epic, unique).
- Migration CHECK constraints: `ck_items_category`/`ck_items_rarity` (`003_worlds.ts`), `ck_actor_items_type` (`005_actor_data.ts`).
- `schema-crafting.ts` unchanged — its `QualityLevel` is crafting-output quality, unrelated to `ItemRarity`.
- Verified: `db:schemas:check` green, full suite 3403 pass / 0 fail, typecheck + frontend + coverage (96.92%) pass.

## Files to Modify

- `src/db/enums-story/items.ts` — extend enums
- `src/db/enums-core/flags.ts` — deprecate `ActorItemType`
- `src/battle/items-integration.ts` — use `ItemRarity`
- `src/rpg/loot/types.ts` — alias to `ItemRarity`
- `src/db/migrations/parts/003_worlds.ts` — CHECK constraints on `items` (inline)
- `src/db/migrations/parts/005_actor_data.ts` — CHECK constraint on `actor_items.item_type` (inline)
- `src/db/schema-crafting.ts` — update references

## Related

- `epic-item-system-extensions.md` — depends on unified types
- `epic-battle-integration-gaps.md` — battle-items mapping
