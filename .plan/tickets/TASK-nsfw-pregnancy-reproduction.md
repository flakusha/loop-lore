# TASK: NSFW Pregnancy & Reproduction

**Epic:** AO NSFW Game Mechanics
**Priority:** Medium
**Effort:** Large
**Status:** Not Started

## Summary

Implement pregnancy/reproduction mechanics: pregnancy chance calculation, pregnancy state tracking, gestation periods, species-specific reproduction (egg-laying, live birth), offspring generation, and cross-species hybrid mechanics.

## Core Features

### Pregnancy Chance

- Base chance per encounter
- Fertility modifier
- Heat cycle modifier
- Contraception modifier
- Species compatibility modifier

### Pregnancy State

- Gestation tracking (day-by-day)
- Stage progression (early, mid, late, labor)
- Health/complications
- Effects on mother (stamina, sensitivity, mood, cravings)

### Species-Specific

- Live birth vs egg-laying
- Variable gestation periods
- Litter sizes
- Hybrid viability

### Offspring

- Trait inheritance
- Species determination
- Stat generation
- Name/appearance generation

## Tasks

- [ ] Design pregnancy system architecture
- [ ] Implement pregnancy chance calculation
- [ ] Implement pregnancy state tracking
- [ ] Implement gestation progression
- [ ] Implement pregnancy effects on mother
- [ ] Implement species-specific reproduction
- [ ] Implement egg-laying mechanics
- [ ] Implement offspring generation
- [ ] Implement trait inheritance
- [ ] Implement cross-species hybrids
- [ ] Implement contraception system
- [ ] Integrate with body system
- [ ] Integrate with encounter system
- [ ] Write tests for pregnancy system

## Files

- `src/rpg/pregnancy/manager.ts` — pregnancy manager
- `src/rpg/pregnancy/chance.ts` — pregnancy chance
- `src/rpg/pregnancy/state.ts` — pregnancy state
- `src/rpg/pregnancy/gestation.ts` — gestation tracking
- `src/rpg/pregnancy/offspring.ts` — offspring generation
- `src/rpg/pregnancy/species.ts` — species-specific
- `src/rpg/pregnancy/types.ts` — type definitions
