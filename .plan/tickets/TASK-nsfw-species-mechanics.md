<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Species-Specific Mechanics

**Epic:** AO NSFW Game Mechanics
**Priority:** Low
**Effort:** Very High
**Status:** Not Started

## Summary

Implement species-specific NSFW mechanics: different reproductive systems, heat/rut cycles, pheromone compatibility, size differences, and cross-species interaction mechanics, driven by the canonical `SizeCategory`, `BodyBuild`, and `HeatPhase` enums in `src/db/enums-character/nsfw.ts`.

## Core Features

### Species Variations

- Species set and per-species physiological traits are defined in the species gameplay data (not duplicated as prose here); extend `BodyBuild`/`SizeCategory` enums to add layout-relevant dimensions.

### Reproductive Differences

- Live birth vs egg-laying vs budding vs spore
- Variable gestation periods
- Litter sizes
- Hybrid viability

### Physical Differences

- Size variations (affects compatibility): see canonical `SizeCategory` enum
- Body build/frame variations: see canonical `BodyBuild` enum
- Texture differences (fur, scales, slime)
- Temperature differences (fire, ice)

### Species Compatibility

- Compatible species for reproduction
- Compatible species for interaction
- Incompatible species (mechanical barriers)

## Tasks

- [ ] Design species mechanics architecture
- [ ] Implement species definitions
- [ ] Implement reproductive differences
- [ ] Implement physical differences
- [ ] Implement size compatibility
- [ ] Implement species-specific kinks
- [ ] Implement cross-species interactions
- [ ] Implement hybrid mechanics
- [ ] Integrate with body system
- [ ] Integrate with pregnancy system
- [ ] Integrate with pheromone system
- [ ] Write tests for species mechanics

## Files

- `src/rpg/species-nsfw/manager.ts` — species manager
- `src/rpg/species-nsfw/definitions.ts` — species definitions
- `src/rpg/species-nsfw/reproduction.ts` — reproductive differences
- `src/rpg/species-nsfw/physical.ts` — physical differences
- `src/rpg/species-nsfw/compatibility.ts` — compatibility
- `src/rpg/species-nsfw/types.ts` — type definitions
