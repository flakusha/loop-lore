<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Enemies & Monsters Systems

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-battle-action-systems
**Tags:** enemies, monsters, creatures, beasts, combat, config

## Description

Add a comprehensive enemies/monsters system with related config files. Defines creature types, behaviors, stats, loot tables, and encounter strategies. Extends the Battle Action Systems epic with a dedicated enemy/monster subsystem.

## How It Extends Existing Work

Builds on the Battle Action Systems epic's combat mechanics, battle state, and battle utilities. Adds a dedicated enemy/monster system with config files on top of the existing combat infrastructure.

## Acceptance Criteria

- [ ] Enemy/monster data model (type, stats, abilities, loot, behavior)
- [ ] Creature type categories (beast, humanoid, undead, elemental, dragon, aberration, etc.)
- [ ] Creature behavior profiles (aggressive, defensive, passive, fleeing, pack hunting)
- [ ] Enemy stat blocks (HP, ATK, DEF, SPD, elements, resistances, weaknesses)
- [ ] Loot tables per creature type (fixed, random, condition-based)
- [ ] Encounter strategies (solo, group, ambush, pursuit, boss)
- [ ] Creature config files (YAML/JSON per creature or per creature group)
- [ ] Creature scaling (difficulty based on player level/world settings)
- [ ] `GET /api/worlds/:id/creatures` — list creatures in a world
- [ ] `GET /api/creatures/:id` — get creature details
- [ ] `POST /api/encounters/generate` — generate a random encounter
- [ ] Frontend creature bestiary
- [ ] Frontend encounter generator with difficulty settings
- [ ] Config: creature files reloadable without server restart (hot-reload)

## Technical Notes

- Creature config files stored in `config/creatures/` directory (YAML or JSON)
- Hot-reload support: config files can be updated and reloaded without server restart
- Creature scaling uses the existing world mechanics config (Epic: RPG Mechanics)
- Loot tables integrate with the existing item system (Epic: Item System Extensions)
- Encounter generation uses weighted random selection from creature config
- Integrates with World & Locations epic for region-specific creature spawns
- Integrates with Weather & Environment epic for weather-influenced creature behavior
- Integrates with Battle Action Systems for combat mechanics
