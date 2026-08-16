<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Mechanics & Extensible Game Systems

**Status:** 🟡 Phase 1 Complete — Core systems implemented; extended systems (quests, achievements, inventory, etc.) pending
**Priority:** Medium
**Effort:** Very High
**Epic:** epic-rpg-mechanics

## Summary

RPG mechanics, multiple settings support, plugin/logic expansions, all possible improvements and mechanics implementable, ability to disable mechanics per roleplay/world. From `epic-rpg-mechanics.md`.

## Scope

### Core RPG System ✅ Complete

- [x] Stats, skills, abilities — `src/rpg/stats.ts` (6 core abilities, D&D 5e modifiers)
- [x] Dice engine — `src/rpg/dice.ts` (crypto-grade entropy, NdS±M notation, advantage/disadvantage)
- [x] Combat system — `src/rpg/combat.ts` (initiative, attacks, damage, action economy)
- [x] XP progression — `src/rpg/xp.ts` (D&D 5e levels 1-20, enemy CR, quests)
- [x] Loot system — `src/rpg/loot.ts` (rarity-weighted tables, level-scaling)
- [x] DB schema — `src/db/schema-rpg.ts` (5 tables)
- [x] API routes — `src/routes/rpg.ts` (6 endpoints)
- [x] Unit tests — 189 tests across 5 test files

### Extended Systems (pending)

- [ ] Leveling and progression (beyond core XP)
- [ ] Equipment and inventory management
- [ ] Multiple settings support
- [ ] Setting-specific mechanics
- [ ] Mechanic disabling per world
- [ ] Plugin-based mechanic extensions
- [ ] Custom mechanic creation

### Multiple Settings

- Fantasy, sci-fi, modern, etc.
- Setting-specific mechanics
- Setting disabling per world

### Extensibility

- Plugin-based mechanic additions
- Custom mechanic creation
- Mechanic disabling per world

## Linked Epics

- `epic-rpg-mechanics.md`

## Acceptance Criteria

- [x] Core RPG system (stats, skills, abilities)
- [x] Leveling and progression system (D&D 5e XP tables)
- [ ] Equipment and inventory management
- [ ] Multiple settings support
- [ ] Setting-specific mechanics
- [ ] Mechanic disabling per world
- [ ] Plugin-based mechanic extensions
- [ ] Custom mechanic creation
- [x] Unit tests for RPG calculations
- [ ] Integration tests for RPG workflow

## Notes

- Reference `epic-rpg-mechanics.md` for full system design
- Consider balance between depth and accessibility
- Allow disabling mechanics for simpler gameplay
