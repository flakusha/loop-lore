<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-053: Item Stats Drift System

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Item stats drift stored on ItemInstance.properties.drift; per-rarity caps.
**Context:** Stat evolution over item lifetime.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, stats
**Epic**: epic-items
**Assignee**:

## Summary

Allows `world_items` instances to drift from their `ItemDefinition` baseline over time — per-instance stat multipliers (e.g. "well-worn +5% damage", "battle-hardened -10% durability loss") accrue through combat/crafting events. Drift lives on the instance, not the definition, so a second copy of the same sword starts fresh.

## Context

- Instance shape: `ItemInstance` (`src/story/items/types.ts`) carries `properties` JSON which is the natural drift-store.
- Event producers: combat damage (`src/rpg/combat/damage.ts`), crafting process (`src/rpg/crafting/process.ts`), station operation (`src/rpg/crafting/stations.ts`).
- Modifier consumer: `src/rpg/stats/modifiers.ts` reads flat deltas — drift values must lower to this shape.
- Rarity weights: `src/rpg/loot/weights.ts` defines `RARITY_WEIGHTS`; drift rate may scale with rarity.
- Upstream: depends on durability (TASK-051) for decay coupling and effects (TASK-052) for how drift interacts with `ItemEffect`.

## Acceptance Criteria

- `ItemInstance.properties.drift: { statMultipliers: Record<string, number>, battleUses: number, lastDriftAt: string }` is the canonical drift shape.
- `applyDrift(worldItemId, worldId, event)` mutates `properties.drift` after combat/crafting events, capped per-rarity (`src/story/items/instances.ts`).
- Drift caps: `ItemRarity.Common` ≤ 5%, `Rare` ≤ 15%, `Legendary` ≤ 30%, `Unique` no cap (verify in `weights.ts`).
- Combat roll (`src/rpg/combat/damage.ts`) multiplies base damage by `1 + sum(drift.statMultipliers["damage"] ?? 0)` before resolving the hit.
- Drift persists across `transfer` and `placeInLocation` (drift is per-row, not per-location).

## Related Files

- `src/story/items/instances.ts` *(existing)* — `applyDrift` hook on update paths.
- `src/rpg/stats/modifiers.ts` *(existing)* — drift lowers to modifier deltas.
- `src/rpg/loot/weights.ts` *(existing)* — rarity-keyed drift cap table.
- `src/rpg/combat/damage.ts` *(speculative)* — drift multiplier in damage pipeline.

## Notes

- Speculative items are marked; verify against current `src/rpg/combat/` before implementation.
- Drift resets on item repair — coordinate with TASK-051 repair flow.
- "Soul-bound" semantics for `ItemRarity.Unique` (drift persists forever vs resets on owner change) is TBD.
