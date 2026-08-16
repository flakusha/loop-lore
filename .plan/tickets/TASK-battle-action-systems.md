<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle & Action Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Epic:** epic-battle-action-systems

## Summary

Battle UI, battle mechanics (turn-based, simultaneous), action system, initiative, damage calculation, status effects. From `epic-battle-action-systems.md`.

## Scope

### Battle Mechanics

- Turn-based and simultaneous modes
- Initiative system
- Action economy (actions, bonus actions, reactions)

### Action System

- Attack actions (melee, ranged, magical)
- Skill actions (stealth, persuasion, intimidation)
- Item actions (use, throw, activate)
- Movement actions

### Damage Calculation

- Base damage + modifiers
- Critical hits and fumbles
- Damage types (physical, magical, elemental)

### Status Effects

- Buffs and debuffs
- Duration and stacking
- Immunity and resistance

## Linked Epics

- `epic-battle-action-systems.md`

## Acceptance Criteria

- [ ] Turn-based and simultaneous battle modes
- [ ] Initiative system with dexterity modifiers
- [ ] Action economy (actions, bonus actions, reactions)
- [ ] Attack actions with damage calculation
- [ ] Critical hits and fumble mechanics
- [ ] Status effect system with duration and stacking
- [ ] Integration with RPG stats and skills
- [ ] Unit tests for battle calculations
- [ ] Integration tests for full battle workflow

## Notes

- Reference `epic-battle-action-systems.md` for full system design
- Consider battle speed vs. tactical depth
- Balance action economy for engaging combat
