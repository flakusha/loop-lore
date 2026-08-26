<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RPG Progression — Traits, Skills & Status Effects

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** rpg, progression, traits, skills, buffs, debuffs
**Parent Epic:** RPG Mechanics & Extensible Game Systems (epic-rpg-mechanics.md)

## Summary

Character traits and personality mechanics, the skill/ability system (trees, points, cooldowns), and the buffs/debuffs status-effect engine. Owns the `StatusEffect` contract shared with Battle and Magic.

## Sub-Epic of

Part of the **RPG Mechanics & Extensible Game Systems** mega-epic. See parent epic for full scope, integration matrix, and slicing rationale.

## Scope

### Character Traits

- Character traits and personality (mechanics side; identity/personality modeling stays with Epic Character Core System)
- Trait modifiers feeding skill checks and stat calculations

### Skills System

- Skill trees and progression
- Skill points allocation
- Skill cooldowns and requirements
- Skill effects and modifiers

### Buffs & Debuffs System

- Temporary status effects
- Effect stacking and duration
- Effect application and removal
- Visual indicators and UI

## Shared Contract: StatusEffect

`StatusEffect` is the shared buff/debuff model consumed by **Battle** (`epic-battle-action-systems.md`),
**Magic** (`epic-magic-spell-systems.md`), Disease (`epic-disease-poison.md`), and Social
(`epic-social-interaction.md`). This sub-epic owns the canonical definition; consumers map their
effects onto it. Long-term, status effects fold into the layered Player State model
(`epic-player-state-machine.md`) — design against that migration.

> **Ownership boundary:** spells/casting and battle-side skill rolls belong to the Spells &
> Skills sub-epic of Epic Battle & Action Systems (`epic-spells-skills.md`). This epic owns the
> RPG-side skill/ability progression system (trees, points, cooldowns) only — do not duplicate.

## Tasks

- [ ] Character traits system
- [ ] Skill/ability system
- [ ] Buffs/debuffs system


- [x] XP/leveling system — D&D 5e progression

## Design (from implementation roadmap)

### File: src/rpg/skills.ts

Skills derived from attributes:

- Athletics (STR), Acrobatics (DEX), Stealth (DEX)
- Perception (WIS), Arcana (INT), Investigation (INT)
- Medicine (WIS), Survival (WIS), Persuasion (CHA)
- Intimidation (CHA), Animal Handling (WIS), History (INT)

### File: src/rpg/xp.ts

XP tracking on world actor state, level-up logic. (XP engine itself is Phase-1 complete and wired via `epic-rpg-core-wiring.md`; level-up/progression hooks land here.)

## Dependencies

- **Parent hub:** epic-rpg-mechanics.md (shared contracts `CharacterStats`, `SkillCheck`, `StatusEffect`)
- **Depends on:** epic-rpg-core-wiring.md (registry + barrel; FIRST in sequence)
- **Siblings:** epic-items-economy-crafting.md (consumable-driven effects), epic-player-state-machine.md (status effects map onto Physical/Mental layers)
- **External:** Battle & Action Systems, Magic & Spell Systems (StatusEffect consumers); Resolution System (skill checks flow through resolver)

## Files

- `src/rpg/traits.ts` — character traits (not yet implemented)
- `src/rpg/skills.ts` — skill system (not yet implemented; `src/rpg/skills/` module scaffold exists)
- `src/rpg/buffs.ts` — buffs/debuffs system (not yet implemented)

## Open Questions

- How do trait modifiers interact with point-buy stat generation?
- Should buff stacking follow the Exclusive/Stackable classification from the Player State Machine design?
