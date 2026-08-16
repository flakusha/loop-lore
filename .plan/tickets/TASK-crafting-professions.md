<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: EPIC: Crafting & Professions

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Epic:** epic-crafting-professions

## Summary

Full RPG crafting system with 8 crafting disciplines, 6 gathering disciplines, tiered recipes, crafting stations, profession progression, and quality system. From `epic-crafting-professions.md` — Section 1.

## Scope

### Crafting Disciplines (8)

- Alchemy (INT, WIS) — potions, poisons, elixirs
- Smithing (STR, CON) — weapons, armor, tools
- Enchanting (INT, CHA) — enchanted items, scrolls
- Cooking (WIS, DEX) — meals, buff food
- Tailoring (DEX, INT) — cloth armor, bags, cloaks
- Woodworking (DEX, STR) — ranged weapons, staves, furniture
- Jewelry (DEX, INT) — accessories, gem cutting
- Engineering (INT, DEX) — gadgets, traps, mechanical items

### Gathering Disciplines (6)

- Farming, Fishing, Mining, Herbalism, Skinning, Logging

### Core Systems

- Recipes — tiered definitions with materials, station requirements, quality ranges
- Stations — world-placed with tier bonuses (speed, quality, success, material saving)
- Process — crafting attempt with success/failure/critical outcomes, XP gain
- Quality — 6-tier system (Poor → Legendary) with stat bonuses
- Profession Progression — level-based with titles and bonuses

## Linked Epics

- `epic-crafting-professions.md`

## Acceptance Criteria

- [ ] 8 crafting disciplines implemented with stat requirements
- [ ] 6 gathering disciplines implemented
- [ ] Recipe system with tiered definitions and material requirements
- [ ] Crafting station system with tier bonuses
- [ ] Crafting process with success/failure/critical outcomes
- [ ] 6-tier quality system (Poor → Legendary)
- [ ] Profession progression with levels and titles
- [ ] XP gain and skill increase on crafting attempts
- [ ] Integration with RPG stats (INT, WIS, STR, CON, DEX, CHA)
- [ ] Unit tests for all crafting calculations
- [ ] Integration tests for full crafting workflow

## Notes

- Reference `epic-crafting-professions.md` for full system design
- See `src/rpg/crafting/` for existing code
- Integration with combat system for poison application
- Integration with alchemy for antidote creation
