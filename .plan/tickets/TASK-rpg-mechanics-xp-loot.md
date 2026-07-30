# TASK: RPG Mechanics — XP Progression & Loot

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics

## Summary

Implement XP progression and loot systems for RPG gameplay: experience tracking, level-ups, loot tables, and stat scaling on level-up.

## Scope

- XP tracking per character
- Level-up thresholds and stat scaling
- Loot tables (common/uncommon/rare/legendary)
- Equipment loot drops from combat
- Unit tests for XP calculations and loot tables

## Acceptance Criteria

- [ ] `gainXP(actor, amount)` adds XP and triggers level-up if threshold met
- [ ] `levelUp(actor)` increases stats based on class/race progression table
- [ ] `rollLoot(table)` returns random item with rarity-weighted probability
- [ ] Loot tables for each combat encounter type
- [ ] Unit tests cover XP thresholds, level-up stat increases, loot rarity distribution
- [ ] Integration with battle resolution for automatic XP award on combat completion

## Notes

- XP thresholds should be configurable per world/setting
- Loot tables should be defined in YAML/JSON for easy tuning by game designers
- Level-up stat increases should follow D20 convention (ASI/feat choice or stat boost)
