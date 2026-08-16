<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Body & Physical Systems

**Epic:** AO NSFW Game Mechanics
**Priority:** Medium
**Effort:** Large
**Status:** Not Started

## Summary

Implement body/physical attribute systems: physique profiles (stamina, flexibility, sensitivity, endurance), appearance (beauty, charisma, style), body modifications (piercings, tattoos), and size/compatibility mechanics.

## Core Features

### Physique Profile

- Stamina: affects encounter duration
- Flexibility: affects available positions/actions
- Sensitivity: affects arousal buildup rate
- Endurance: affects recovery time
- Size/Build: affects compatibility with partners

### Appearance

- Beauty: base attractiveness
- Charisma: personality-based attraction
- Style: clothing/fashion sense
- Scent: natural scent affecting pheromones
- Temporary modifiers: clothing, magic, potions

### Body Modifications

- Piercings: attractiveness/erogenous effects
- Tattoos: intimidation/fetish appeal
- Scars: history/story effects
- Implants: magical/technological enhancements

### Compatibility

- Size compatibility between partners
- Species compatibility
- Physique interaction effects

## Tasks

- [ ] Design body system architecture
- [ ] Implement physique profiles
- [ ] Implement appearance system
- [ ] Implement body modifications
- [ ] Implement size compatibility
- [ ] Implement species compatibility
- [ ] Implement physique interaction effects
- [ ] Integrate with seduction system
- [ ] Integrate with encounter system
- [ ] Write tests for body systems

## Files

- `src/rpg/body/manager.ts` — body system manager
- `src/rpg/body/physique.ts` — physique profiles
- `src/rpg/body/appearance.ts` — appearance system
- `src/rpg/body/modifications.ts` — body modifications
- `src/rpg/body/compatibility.ts` — compatibility checks
- `src/rpg/body/types.ts` — type definitions
