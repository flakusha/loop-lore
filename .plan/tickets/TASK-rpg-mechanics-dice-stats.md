# TASK: RPG Mechanics — Dice Engine & Stat System

**Status:** ✅ Complete
**Priority:** High
**Effort:** High
**Epic:** epic-rpg-mechanics

## Summary

Implement the core dice engine and stat system for RPG gameplay: dice rolling with modifiers, advantage/disadvantage, and the six core stats (STR, DEX, CON, INT, WIS, CHA) with computed modifiers.

## Scope

- Dice engine supporting d4, d6, d8, d10, d12, d20
- Modifiers (flat, percentage, advantage/disadvantage)
- Six core stats with computed modifiers
- Stat-based skill checks and saving throws
- Unit tests for all dice and stat calculations

## Acceptance Criteria

- [x] `rollDice(sides, count, modifier, advantage)` function produces correct distributions
- [x] Stat modifiers computed as `(stat - 10) / 2` floor, matching D20 conventions
- [x] Advantage/disadvantage: roll 2d20, take max/min respectively
- [x] Unit tests cover all dice sides, modifiers, advantage/disadvantage edge cases
- [x] Integration with existing character system for stat assignment

## Implementation

- `src/rpg/dice.ts` — Crypto-grade entropy via `crypto.getRandomValues`, NdS±M notation parser, advantage/disadvantage, exploding dice
- `src/rpg/stats.ts` — 6 core abilities (STR/DEX/CON/INT/WIS/CHA), D&D 5e modifiers, point-buy, 4d6-drop-lowest, standard array
- `src/db/schema-rpg.ts` — `dice_roll_history` and `character_stats` tables
- `src/routes/rpg.ts` — `/api/rpg/dice/roll`, `/api/rpg/dice/notation`, `/api/rpg/dice/advantage`, `/api/rpg/stats/calculate`, `/api/rpg/stats/validate`, `/api/rpg/stats/generate`
- `src/rpg/dice.test.ts` — 24 tests
- `src/rpg/stats.test.ts` — 32 tests

## Notes

- Reference `docs/spec/rpg-mechanics.md` for full system design
- Dice entropy should use `crypto.getRandomValues` where available
- Stat modifiers should be cached, not recomputed on every access
