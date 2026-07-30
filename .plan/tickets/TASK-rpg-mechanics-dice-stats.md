# TASK: RPG Mechanics — Dice Engine & Stat System

**Status:** ⬜ Not Started
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

- [ ] `rollDice(sides, count, modifier, advantage)` function produces correct distributions
- [ ] Stat modifiers computed as `(stat - 10) / 2` floor, matching D20 conventions
- [ ] Advantage/disadvantage: roll 2d20, take max/min respectively
- [ ] Unit tests cover all dice sides, modifiers, advantage/disadvantage edge cases
- [ ] Integration with existing character system for stat assignment

## Notes

- Reference `docs/spec/rpg-mechanics.md` for full system design
- Dice entropy should use `crypto.getRandomValues` where available
- Stat modifiers should be cached, not recomputed on every access
