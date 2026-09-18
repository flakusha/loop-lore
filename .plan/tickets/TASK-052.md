<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-052: Item Effects System

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Item effects via ItemEffect discriminated union — on-use, on-equip, passive, timed.
**Context:** Coord with body-systems HeatEffects to avoid duplicate timed-effect machinery.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, effects
**Epic**: epic-items
**Assignee**:

## Summary

Defines how item `properties` JSON translates into gameplay effects when an item is equipped, consumed, or activated. Standardizes an `ItemEffect` shape and hooks the resolution into combat (`src/rpg/combat/`), crafting bonuses (`src/rpg/crafting/`), and stats modifiers (`src/rpg/stats/modifiers.ts`). Currently `ItemDefinition.properties` is opaque JSON; this ticket pins the schema.

## Context

- Definition shape: `ItemDefinition.properties: Record<string, unknown>` (`src/story/items/types.ts`).
- Existing modifier pipeline: `src/rpg/stats/modifiers.ts` consumes flat key/value deltas; item effects must lower to this shape.
- Crafting bonus field: `CraftAttempt.bonus_effects` already stores JSON (`src/rpg/crafting/process.ts`); item-effect grants should write through there.
- Encounter effects reference: `EncounterOutcome.effects: OutcomeEffects` (`src/rpg/encounters/service/types.ts`) — pattern to mirror for `ItemEffect`.
- Upstream: depends on `ItemCategory` enum (`src/db/enums-story/items.ts`) deciding which categories may carry effects (consumable, weapon, armor, artifact).

## Acceptance Criteria

- `ItemEffect` discriminated union: `{ kind: "stat_delta", stat: string, amount: number } | { kind: "on_use", action: string, payload: unknown } | { kind: "passive", condition: string, payload: unknown }` lives in `src/story/items/effects.ts`.
- `resolveItemEffects(item: ItemInstance): ItemEffect[]` parses `ItemDefinition.properties.effects` (typed shape) and returns active effects.
- Combat damage calculation in `src/rpg/combat/damage.ts` consults equipped item effects and applies `stat_delta` entries before the roll.
- Consumable use (`category === ItemCategory.Consumable`) fires `on_use` effects once, then triggers `ItemsService.destroy(worldItemId, worldId, 1)`.
- Effects schema is validated at definition-creation time: malformed `properties.effects` reject with a typed error from `ItemsService.createDefinition`.

## Related Files

- `src/story/items/types.ts` *(existing)* — `ItemDefinition.properties` anchor.
- `src/rpg/stats/modifiers.ts` *(existing)* — modifier consumer.
- `src/story/items/effects.ts` *(speculative)* — `ItemEffect` type + resolver.
- `src/rpg/combat/damage.ts` *(speculative)* — apply-on-equip hook.

## Notes

- Speculative items are marked; verify against current `src/story/items/` before implementation.
- Buff/debuff duration semantics (timed effects) overlap with `src/rpg/body-systems/service/types.ts` `HeatEffects`; coordinate, do not duplicate.
- Hard-cap on simultaneous effects per actor is TBD; defer to balance pass.
