<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Mechanics — XP Progression & Loot

**Status:** ✅ Complete
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

- [x] `gainXP(actor, amount)` adds XP and triggers level-up if threshold met
- [x] `levelUp(actor)` increases stats based on class/race progression table
- [x] `rollLoot(table)` returns random item with rarity-weighted probability
- [x] Loot tables for each combat encounter type
- [x] Unit tests cover XP thresholds, level-up stat increases, loot rarity distribution
- [x] Integration with battle resolution for automatic XP award on combat completion

## Implementation

- `src/rpg/xp.ts` — D&D 5e progression (levels 1-20), `xpForLevel`, `canLevelUp`, `levelFromXp`, `awardXp` (multi-level-up), `xpForEnemyDefeat` (CR-based, party split), `xpForQuest` (difficulty multipliers), `hpOnLevelUp`, ASI levels (4/8/12/16/19)
- `src/rpg/loot.ts` — Rarity-weighted drop tables (common/uncommon/rare/legendary/artifact), level-scaling, `generateLoot` with luck modifier, `createLootTable`, `mergeLootTables`, template tables
- `src/db/schema-rpg.ts` — `xp_ledger`, `loot_tables`, `loot_entries` tables
- `src/rpg/xp.test.ts` — 20 tests
- `src/rpg/loot.test.ts` — 12 tests

## Notes

- XP thresholds should be configurable per world/setting
- Loot tables should be defined in YAML/JSON for easy tuning by game designers
- Level-up stat increases should follow D20 convention (ASI/feat choice or stat boost)
