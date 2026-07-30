# TASK: Disease & Poison Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-disease-poison

## Summary

Disease and poison mechanics — afflictions, symptoms, cures, resistance, and healing. Integrates with alchemy for antidote creation and combat for poison application. From `epic-disease-poison.md`.

## Scope

### Disease System

- Disease types (viral, bacterial, magical, parasitical)
- Transmission mechanics
- Symptoms and severity progression

### Poison System

- Poison types (basic, lethal, paralysis, sleep)
- Application methods (weapon coating, ingestion)
- Effect duration and potency

### Cure & Treatment

- Cure types (spells, potions, rest)
- Treatment effectiveness
- Resistance system

## Linked Epics

- `epic-disease-poison.md`

## Acceptance Criteria

- [ ] Disease types with transmission mechanics
- [ ] Disease progression system (symptoms, severity, duration)
- [ ] Poison types with application methods
- [ ] Poison effect system (damage, debuffs, status effects)
- [ ] Resistance system based on CON/WIS stats
- [ ] Antidote crafting integration with alchemy
- [ ] Combat integration for poison weapon coating
- [ ] Unit tests for disease/poison calculations
- [ ] Integration tests for full affliction workflow

## Notes

- Reference `epic-disease-poison.md` for full system design
- Consider disease spread in populated areas
- Balance poison to avoid being game-breaking
