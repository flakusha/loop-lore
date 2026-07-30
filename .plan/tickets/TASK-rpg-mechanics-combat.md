# TASK: RPG Mechanics — Combat Engine

**Status:** ✅ Complete
**Priority:** High
**Effort:** High
**Epic:** epic-rpg-mechanics

## Summary

Implement the combat engine for RPG gameplay: initiative tracking, attack rolls, damage calculation, armor class, and round resolution. Integrates with the existing battle system in `src/battle/`.

## Scope

- Initiative: Dexterity-based, with tiebreaker rules
- Attack rolls: d20 + modifiers vs target AC
- Damage calculation: weapon dice + stat modifiers
- Armor class: base AC + armor + shield + dex cap
- Round resolution: combatant ordering, action economy
- Unit tests for all combat calculations

## Acceptance Criteria

- [x] `initiative(order)` returns sorted combatant list with tiebreaker
- [x] `attackRoll(attacker, defender)` returns hit/miss with damage on hit
- [x] `armorClass(actor)` computes AC from equipment + dex + misc modifiers
- [x] Combat round resolves all combatants in initiative order
- [x] Unit tests cover hit/miss, critical hits, damage ranges, initiative ties
- [x] Integrates with `src/battle/` resolution module for unified dice resolution

## Implementation

- `src/rpg/combat.ts` — Initiative (d20 + DEX mod), attack rolls (ability mod + proficiency + advantage), damage calculation (base dice + ability mod + flat bonus, with resistances/vulnerabilities/immunity), saving throws, action economy (actions, bonus actions, reactions), condition tracking
- `src/rpg/combat.test.ts` — 32 tests
- `src/routes/rpg.ts` — Routes wired via Elysia after battle routes

## Notes

- Builds on existing battle infrastructure in `src/battle/resolution-integration.ts`
- Action economy should support bonus actions, reactions, free actions
- Critical hits should follow D20 convention (natural 20)
