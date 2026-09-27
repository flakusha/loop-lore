<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-035: NSFW Body & Physical Systems

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** medium
**Effort:** Large
**Summary:** Body/physical on BodyBuild + SizeCategory via shared StatusEffect.
**Context:** Gameplay-layer physique; stamina/endurance mechanics.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done — pre-existing implementation; body-systems module shipped in commits e4bfc9767 / a88211f72 / cc6cb7c67
**Priority**: medium
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Body/physical systems layered on `BodyBuild` and `SizeCategory` enums; mod fatigue/stamina via shared `StatusEffect`.

## Context

Implements physique profiles and endurance on `BodyBuild` + `SizeCategory` in `src/db/enums-character/nsfw.ts`. Physical state is modeled as a shared `StatusEffect` (`arousal`, `exhaustion`, `aphrodisiac`) consumed by RPG/Battle/Disease. All mutations respect `ContentIntensity` tier from epic-nsfw-capabilities.

## Acceptance Criteria

- `src/rpg/body.ts` exposes `BodyService` with `getProfile(actor)` returning physique + current physical status
- `BodyBuild` values (`slim`, `average`, `muscular`, `heavyset`, ...) extend the enum; ad-hoc strings are rejected at the schema boundary
- Stamina/endurance tracked via the shared `StatusEffect` model (no private stamina field)
- Modifiers from CON stat are read through the unified `ResolutionSystem`, not duplicated in body logic
- Encounter outcomes from TASK-036 apply `StatusEffect` deltas that surface here without a separate code path

## Related Files

- `src/rpg/body.ts` (speculative — file may not exist yet)
- `src/db/enums-character/nsfw.ts` — `BodyBuild`, `SizeCategory` enums
- `src/db/schema/status-effect.ts` — shared `StatusEffect` model
- `src/rpg/resolution.ts` — CON-driven modifier consumer
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #6 (balance) matters most here: body/stamina stats must not leak into non-NSFW combat balance without an explicit opt-in flag.


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Note: the public class is named `BodySystemService` (not `BodyService`) — same barrel pattern as `intimacy.ts` and `seduction.ts`.

- `src/rpg/body.ts` — thin barrel re-exporting `./body-systems`.
- `src/rpg/body-systems/index.ts` — public surface re-exporting `BodySystemService` + types (`BodyProfile`, `BodyModification`, `HeatCycleState`, `UpdateBodyProfileOpts`).
- `src/rpg/body-systems/service/index.ts` — `BodySystemService` class with `getProfile(actorId) → BodyProfile`, `updateProfile`, `addModification`, `removeModification`, `getHeatCycle(actorId, species=Human)`, `advanceHeatCycle(actorId, days) → { newPhase: HeatPhase, daysUntilNext }`, `getHeatEffects(actorId)`, `getPhysicalStatus(actorId) → { profile, arousal, exhaustion, aphrodisiac, effectiveStamina, effectiveDuration }` (TASK-035's "physique + current physical status").
- `src/rpg/body-systems/service/profile.ts` — `getProfile / updateProfile / addModification / removeModification` against `character_body_profile` rows. `BodyBuild` and `SizeCategory` enums drive validation at the schema boundary (TypeBox), so ad-hoc strings reject before reaching this layer.
- `src/rpg/body-systems/service/heat.ts` — heat cycle state machine (`Normal → PreHeat → Heat → Cooling → Normal`) with `HeatPhase` enum transitions and `getHeatEffects(actorId)` returning nullified effects for non-heat species. `Species.Human` baseline works with no heat requirement (Open Q2 deferred but compatible).
- `src/rpg/body-systems/service/derived.ts` — `calculateEncounterDuration(profile, conModifier)`, `calculateAvailableActions(profile)`, `calculateArousalModifier(profile)`. Static factories reused by the encounter service (TASK-036) without duplication.
- `src/rpg/body-systems/enums.ts` — `BodyBuild` (`Slim / Athletic / Average / Muscular / Heavyset / Stocky / Petite / Curvy / Lanky`), `SizeCategory` (`Petite / Small / Average / Large / Huge / Titanic`), `Species` (human baseline + species-aware). All enum-driven, ad-hoc strings rejected.
- `src/rpg/body-systems/service/index.ts:getPhysicalStatus` — merges profile with `getActiveEffects(db, actorId, { category: "physical" })` from `rpg/status-effects`. Stamina lives ONLY on `character_body_profile`; transient drain (`exhaustion`, `arousal`, `aphrodisiac`) lives in shared `status_effect` rows. CON modifier pulled via `getModifier(statBlock, "con")` from `rpg/stats/modifiers.ts` — no duplicate stat logic. Encounter completion (TASK-036) writes those same rows through chemistry/trauma, so they surface here without a second code path.
- `src/db/enums-character/nsfw.ts:BodyBuild` and `:SizeCategory` — cross-reference copies of the body-systems enums, kept in sync for legacy import paths.
- `src/rpg/body-systems/service/heat.test.ts` and `src/rpg/body-chemistry-trauma.test.ts` — coverage of heat cycle, status merging, and the shared status bridge.

Acceptance criteria checklist:

- [x] `src/rpg/body.ts` exposes `BodySystemService` (the public name; matches the barrel pattern) with `getProfile(actor)` returning physique + transient physical status via `getPhysicalStatus`.
- [x] `BodyBuild` values extend the enum (`src/rpg/body-systems/enums.ts`); ad-hoc strings rejected at the TypeBox schema boundary.
- [x] Stamina lives on `character_body_profile`; transient drain lives in shared `status_effect` rows — no private stamina field.
- [x] CON modifiers read through `rpg/stats/modifiers.ts:getModifier(block, "con")`; not duplicated.
- [x] Encounter outcomes (TASK-036) write the same shared `status_effect` rows; `getPhysicalStatus` reads them with no second code path.

Open Question #6 (balance): the stamina stat lives on `character_body_profile`; only `arousal / exhaustion / aphrodisiac` (NSFW-physical effects) hit shared `status_effect` rows. Non-NSFW combat does not import or consult these fields without opting in via the world-ruleset template (TASK-035 balance gate).
