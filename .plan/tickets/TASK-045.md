<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-045: NSFW Species Mechanics

**Status:** open
**Priority:** low
**Effort:** Very High
**Summary:** Species variants gated by config.toml cross-species pairs matrix.
**Context:** Gameplay-layer species-specific reproduction/attraction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: low
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Species-specific mechanics layered on character-species flags; cross-species interactions gated by configuration.

## Context

Implements species-aware variants of intimacy, reproduction, and pheromone systems on top of `src/db/enums-character/character-species.ts`. Cross-species interactions gate via configuration in `configs/config.nsfw.example.toml` (which species pairs are allowed). All paths respect `ContentIntensity` tier from epic-nsfw-capabilities.

## Acceptance Criteria

- `src/rpg/species-mechanics.ts` exposes `SpeciesMechanicsService` with `getVariant(speciesId, mechanic)`, `canInteract(speciesA, speciesB)`
- Species mechanics extend canonical enums via species-tagged union types, not ad-hoc string flags
- `canInteract` consults `configs/config.nsfw.example.toml` for the allowed-pairs matrix; hard-coded allowlists are rejected
- Reproduction (TASK-038) consumes `getVariant('reproduction')` rather than re-deriving species logic
- Pheromones (TASK-039) consume `getVariant('pheromone')` rather than re-deriving species logic

## Related Files

- `src/rpg/species-mechanics.ts` (speculative — file may not exist yet)
- `src/db/enums-character/character-species.ts` — species flags
- `configs/config.nsfw.example.toml` — `[nsfw]` cross-species pairs
- `src/rpg/reproduction.ts` — downstream consumer
- `src/rpg/chemistry.ts` — downstream consumer

## Notes

Open Question #2 (species mechanics scope) directly bounds ticket scope; this ticket must support the human baseline even when cross-species variants are disabled.
