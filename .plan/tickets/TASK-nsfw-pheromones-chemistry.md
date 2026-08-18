<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Pheromones & Chemistry

**Epic:** AO NSFW Game Mechanics
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Implement the pheromone system (natural/synthetic attraction), consumable effects, chemical resistance, and heat/rut cycle mechanics for species that have them, driven by the canonical `HeatPhase` enum in `src/db/enums-character/nsfw.ts`.

## Core Features

### Pheromones

- Natural pheromones per species/character
- Modified by state (heat, arousal, stress)
- Species compatibility
- Affects nearby characters

### Aphrodisiacs

- Natural, alchemical, magical, technological types
- Effects: arousal boost, buildup rate, resistance reduction
- Application methods per item type
- Side effects, addiction risk
- Detection difficulty

### Chemical Resistance

- Base resistance per character
- Modified by species, willpower, experience
- Can be trained through exposure

### Heat/Rut Cycles

- Species-specific reproductive cycles
- Phase progression (normal → pre-heat → heat → post-heat): see canonical `HeatPhase` enum in `src/db/enums-character/nsfw.ts`
- Mechanical effects (arousal multiplier, fertility, mood)
- Duration and cycle length

## Tasks

- [ ] Design pheromone system architecture
- [ ] Implement natural pheromones
- [ ] Implement pheromone effects on nearby characters
- [ ] Implement aphrodisiac items
- [ ] Implement aphrodisiac effects
- [ ] Implement chemical resistance
- [ ] Implement resistance training
- [ ] Implement heat/rut cycles
- [ ] Implement heat effects on gameplay
- [ ] Integrate with seduction system
- [ ] Integrate with body system
- [ ] Integrate with pregnancy system
- [ ] Write tests for pheromone/chemistry system

## Files

- `src/rpg/pheromones/manager.ts` — pheromone manager
- `src/rpg/pheromones/natural.ts` — natural pheromones
- `src/rpg/pheromones/aphrodisiacs.ts` — aphrodisiac system
- `src/rpg/pheromones/resistance.ts` — chemical resistance
- `src/rpg/pheromones/heat-cycles.ts` — heat/rut cycles
- `src/rpg/pheromones/types.ts` — type definitions
