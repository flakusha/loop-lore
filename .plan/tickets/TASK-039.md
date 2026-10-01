<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-039: NSFW Pheromones & Chemistry

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-nsfw-game-mechanics.md
**Tags:** nsfw-game-mechanics
**Summary:** Pheromones/chemistry as shared StatusEffect consumed by Seduction/Encounter/Disease.
**Context:** Gameplay-layer aphrodisiacs + heat-cycle chemistry.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
**Priority**: medium
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Pheromones/chemistry layered on shared `StatusEffect`; consumed by Seduction, Encounter, and Disease systems.

## Context

Implements pheromone/aphrodisiac chemistry as a shared `StatusEffect` family consumed by RPG/Seduction (TASK-034), Encounter (TASK-036), and Disease. Crafting/professions produces consumable items (aphrodisiacs, contraceptives) that emit this effect. All effects respect `ContentIntensity` tier from epic-nsfw-capabilities.

## Acceptance Criteria

- `src/rpg/chemistry.ts` exposes `ChemistryService` with `applyEffect(target, effectId, duration, magnitude)`
- Pheromone effects are modeled as `StatusEffect` rows keyed by `effectId`; no private chemistry state outside the shared model
- Seduction/Encounter services consume pheromone modifiers by reading `StatusEffect`, not by querying chemistry directly
- Consumable items register through the standard crafting recipe pipeline; ad-hoc item hooks are rejected
- Effect expiry is time-driven via the existing status-effect scheduler, not a parallel timer

## Related Files

- `src/rpg/chemistry.ts` (speculative — file may not exist yet)
- `src/db/schema/status-effect.ts` — shared effect model
- `src/db/enums-character/nsfw.ts` — related heat/cycle enum families
- `src/crafting/` — consumable item registration
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #7 (LLM prompts) matters for narrating chemistry effects; the service must hand the LLM structured effect metadata, not a free-form description.


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Chemistry is a shared `StatusEffect` family; the service is a thin wrapper over the canonical `status_effect` writer, exposing structured metadata for LLM narration. Effect expiry rides the existing status-effect scheduler (`nsfw.status-sweep`, `sweepExpiredEffects`) — no parallel timer.

- `src/rpg/chemistry.ts` — `ChemistryService` class with `applyEffect(target, effectId, duration, magnitude)` (TASK-039 literal), `removeEffect`, `getActiveEffects`, `describeEffect(effectId, magnitude, expiresAt) → ChemistryEffectMetadata` (Open Q7 structured payload). Constructor takes `Kysely<DB>`.
- `src/rpg/chemistry.ts:CHEMISTRY_EFFECTS` — `arousal / aphrodisiac / pheromone_allure / pheromone_heat / contraceptive` constants carrying `{ magnitude, defaultDurationSeconds }`. Adding a chemistry effect requires extending this const, never an ad-hoc string.
- `src/rpg/chemistry.ts:ChemistryEffectMetadata` — `{ effectId, magnitude, expiresAt, source, dcModifier, arousalModifier }` — the structured payload the LLM narrator consumes (Open Q7 contract).
- `src/rpg/status-effects.ts` — shared `StatusEffect` model (`getActiveEffects`, `applyEffect`, `sweepExpiredEffects`). Chemistry writes here, never to a private chemistry store.
- `src/rpg/seduction/service/arousal.ts:modifyArousal` and `src/rpg/encounters/service/participant-legs.ts:applyOutcomes` — read pheromone modifiers via `getActiveEffects(db, actorId, { category: 'physical' })`. They never call `ChemistryService` directly — chemistry is a writer, not a query layer (TASK-039 contract).
- `src/crafting/` — consumable items register through the standard `RecipesService` pipeline; tags carry the effect binding (e.g., `consumable:aphrodisiac:moderate`). Ad-hoc item hooks are rejected at the crafting-recipe schema boundary.
- `src/rpg/body-systems/service/index.ts:getPhysicalStatus` — merges `arousal / aphrodisiac` sums from `getActiveEffects`, demonstrating the no-private-state contract (TASK-039; consistent with TASK-035 `getPhysicalStatus`).
- `src/nsfw/status-sweep.ts` (or co-located scheduler hook) — `sweepExpiredEffects` advances expiry for chemistry rows alongside other status effects; no parallel timer in chemistry.ts.
- `src/rpg/body-chemistry-trauma.test.ts` — coverage of chemistry apply/expire/sweep paths and the structured metadata contract.

Acceptance criteria checklist:

- [x] `src/rpg/chemistry.ts` exposes `ChemistryService` with `applyEffect(target, effectId, duration, magnitude)` writing to shared `status_effect` rows.
- [x] Pheromone effects are `StatusEffect` rows keyed by `effectId`; no private chemistry state outside the shared model.
- [x] Seduction (TASK-034) and Encounter (TASK-036) consume pheromone modifiers by reading `getActiveEffects(db, actorId, { category: 'physical' })`, never by querying ChemistryService directly.
- [x] Consumable items register through `RecipesService`; tag-driven binding; ad-hoc hooks rejected.
- [x] Effect expiry rides the existing status-effect scheduler (`sweepExpiredEffects`), not a parallel timer.

Open Question #7 (LLM narration): settled. `ChemistryEffectMetadata` is the structured payload; LLM consumers receive `{effectId, magnitude, expiresAt, source, dcModifier, arousalModifier}` rather than free-form prose.
