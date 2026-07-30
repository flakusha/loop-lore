# TASK: RPG Mechanics — Combat Engine

**Status:** ⬜ Not Started
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

- [ ] `initiative(order)` returns sorted combatant list with tiebreaker
- [ ] `attackRoll(attacker, defender)` returns hit/miss with damage on hit
- [ ] `armorClass(actor)` computes AC from equipment + dex + misc modifiers
- [ ] Combat round resolves all combatants in initiative order
- [ ] Unit tests cover hit/miss, critical hits, damage ranges, initiative ties
- [ ] Integrates with `src/battle/` resolution module for unified dice resolution

## Notes

- Builds on existing battle infrastructure in `src/battle/resolution-integration.ts`
- Action economy should support bonus actions, reactions, free actions
- Critical hits should follow D20 convention (natural 20)
