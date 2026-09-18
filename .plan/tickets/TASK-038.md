<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-038: NSFW Pregnancy & Reproduction

**Status:** open
**Priority:** medium
**Effort:** Large
**Summary:** Pregnancy/reproduction on species flags + Relationship parentage.
**Context:** Gameplay-layer reproductive cycle + species interaction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Pregnancy/reproduction layered on `ReproductionCapability` flags; species-aware; gated by NSFW rating + consent.

## Context

Implements pregnancy checks and reproduction on the species-defined `ReproductionCapability` flags referenced from `src/db/enums-character/nsfw.ts`. Pregnancy rolls trigger from `nsfw.encounter_completed` (TASK-036). All paths respect `ContentIntensity` tier from epic-nsfw-capabilities. Cross-system: Disease consumes complications, Character Core consumes parentage.

## Acceptance Criteria

- `src/rpg/reproduction.ts` exposes `ReproductionService` with `rollPregnancy(actor, target, encounter)`, `advanceGestation(characterId)`, `birth(characterId)`
- Reproduction mechanics consume species flags via `src/db/enums-character/character-species.ts`; non-reproducing species return early without a dice roll
- Pregnancy rolls are event-driven from `nsfw.encounter_completed`, not polled on a timer
- Complications emit `disease.reproductive_complication` so Disease/poison systems can attach effects without bespoke wiring
- Birth outcomes update Character Core parentage through the canonical `Relationship` model, not a parallel NSFW relationship store

## Related Files

- `src/rpg/reproduction.ts` (speculative — file may not exist yet)
- `src/db/enums-character/character-species.ts` — species reproduction flags
- `src/db/enums-character/nsfw.ts` — heat/cycle enum families
- `src/rpg/encounter.ts` — upstream event emitter
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #2 (species mechanics scope) directly bounds this ticket — if species reproduction is reduced, the pregnancy system must still work for the human baseline.
