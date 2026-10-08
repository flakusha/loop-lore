<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-038: NSFW Pregnancy & Reproduction

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** medium
**Effort:** Large
**Summary:** Pregnancy/reproduction on species flags + Relationship parentage.
**Context:** Gameplay-layer reproductive cycle + species interaction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
**Priority**: medium
**Tags**: nsfw, rpg, game-mechanics
**Epic:** epic-nsfw-game-mechanics

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


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Note: species reproduction flags consolidated at `src/rpg/body-systems/enums.ts:ReproductionCapability` (the `character-species.ts` path in the ticket does not exist); non-reproducing species short-circuit without a dice roll. Pregnancy rolls are event-driven from `nsfw.encounter_completed` via `ReproductionService.rollFromEncounter`, never polled.

- `src/rpg/reproduction.ts` — `ReproductionService` class with `rollPregnancy(actor, target, encounter) → PregnancyStatus` (TASK-038 literal), `rollFromEncounter(encounter, actorId)` (TASK-036 fan-out hook), `advanceGestation(characterId) → { newStage, daysUntilNext }`, `birth(characterId) → { childId, parentage }`, `getPregnancy(characterId)`. Reads species flags via `capabilityFor(species)` from `body-systems/enums.ts:ReproductionCapability`.
- `src/rpg/reproduction-birth.ts` — `birthChild(db, parentId)` creates a new `characters` row + bidirectional `character_relationships` rows of type `family` (parent↔child). Writes through the canonical `Relationship` model — no parallel NSFW relationship store.
- `src/rpg/reproduction-store.ts` — `PregnancyStatus` and `getPregnancy`/`getPregnancyMeta` helpers; pregnancy records live as `status_effect` rows with `effectId = 'pregnancy'` and a `meta` JSON carrying `gestationStage`, `partnerId`, `conceptionEncounterId`, etc. `GESTATION_WEEKS` and `PREGNANCY_EFFECT` constants exported for scheduler + UI consumers.
- `src/rpg/body-systems/enums.ts:ReproductionCapability` — `{ canReproduce: boolean, requiresHeat: boolean, gestationModifier: number, maxLitterSize: number, sterile: boolean }` shape. `Species.Human` baseline has `canReproduce: true, requiresHeat: false` so the pregnancy system works with no heat requirement (Open Q2 human-baseline contract).
- `src/rpg/dice.ts:rollDice` — used by `rollPregnancy` for the success roll (no bespoke RNG).
- `src/rpg/encounters/service/participant-legs.ts:applyOutcomes` — calls `ReproductionService.rollFromEncounter` after intimacy + seduction settle, completing the encounter-completed → pregnancy-roll chain.
- `src/rpg/reproduction.ts:COMPLICATION_EVENT` — `"disease.reproductive_complication"` event fires from `advanceGestation` when a complication stage triggers; Disease/poison systems attach by reading the event (TASK-038 cross-system contract). Verified by `src/rpg/reproduction-reputation.test.ts`.
- `src/rpg/reproduction.test.ts` (or co-located in `reproduction-store`/`reproduction-birth` test files) — coverage of rollPregnancy, advanceGestation, birth, complications, species short-circuit.

Acceptance criteria checklist:

- [x] `src/rpg/reproduction.ts` exposes `ReproductionService` with `rollPregnancy(actor, target, encounter)`, `advanceGestation(characterId)`, `birth(characterId)`.
- [x] Reproduction flags consumed via `body-systems/enums.ts:ReproductionCapability`; non-reproducing species short-circuit without a dice roll.
- [x] Pregnancy rolls are event-driven from `nsfw.encounter_completed` via `applyOutcomes → rollFromEncounter`; never polled.
- [x] Complications emit `disease.reproductive_complication` status rows; Disease/poison systems attach by reading the event (no bespoke wiring).
- [x] Birth outcomes update Character Core parentage through `character_relationships` of type `family` — canonical `Relationship` model, no NSFW-private store.

Open Question #2 (species baseline): `Species.Human` works without heat requirement; the system is extensible via `ReproductionCapability` flags per species. If species reproduction is reduced, the human baseline keeps working.
