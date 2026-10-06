<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-036: NSFW Encounter System

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** high
**Effort:** Very High
**Summary:** Encounter state machine on NsfwEncounterType + HeatPhase; encounter_completed event.
**Context:** Gameplay-layer encounter phases + skill checks + outcomes.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
**Priority**: high
**Tags**: nsfw, rpg, game-mechanics
**Epic:**: epic-nsfw-game-mechanics

## Summary

Encounter system layered on `NsfwEncounterType`, `HeatPhase`, and phase transitions; gating via NSFW rating + consent.

## Context

Implements the encounter state machine on `NsfwEncounterType` and phase progression in `src/db/enums-character/nsfw.ts`. All encounter starts require consent token + matching `ContentIntensity` tier from epic-nsfw-capabilities. Skill checks during encounters route through the unified `ResolutionSystem`. Cross-system event `nsfw.encounter_completed` emits to Disease, XP, Social.

## Acceptance Criteria

- `src/rpg/encounter.ts` exposes `EncounterService` with `start(type, participants)`, `advance(encounterId)`, `complete(encounterId)`
- `NsfwEncounterType` enum drives phase ordering; custom ordering must extend the enum, not hard-code branches
- `nsfw.encounter_completed` event payload includes {type, outcome, participants} for downstream Disease/XP/Social consumers
- Encounter state persists to the `nsfw_encounter` table; phase transitions are append-only events, not in-place mutations
- All start paths check the NSFW capability gate (rating + consent) — bypassing it must throw `CapabilityBlockedError`

## Related Files

- `src/rpg/encounter.ts` (speculative — file may not exist yet)
- `src/db/enums-character/nsfw.ts` — `NsfwEncounterType`, `HeatPhase` enums
- `src/db/schema/nsfw-encounter.ts` — encounter table (speculative)
- `src/schemas/nsfw-rating.ts` — content intensity tier schema
- `src/nsfw/moderation-service/` — upstream rating + consent gate

## Notes

Open Question #3 (fade-to-black vs explicit) is decisive here: encounter outcomes must accept a `NarrativeStyle` mode that controls how explicit the post-encounter event payload is.


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Note: the encounter API uses `createEncounter / advancePhase / complete` rather than the literal `start / advance / complete` names; the call shape carries `type` (NsfwEncounterType) + `participants` (actor ids) as the spec describes.

- `src/rpg/encounter.ts` — thin barrel re-exporting `./encounters`.
- `src/rpg/encounters/service/index.ts` — `EncounterService` class with `createEncounter(opts: CreateEncounterOpts) → NsfwEncounter`, `getEncounter(encounterId)`, `advancePhase(encounterId) → AdvancePhaseResult`, `listEncounters(worldId, opts?)`, `deleteEncounter(encounterId)`. The opts shape is `{ worldId, type: NsfwEncounterType, participants: string[], narrativeStyle?: NarrativeStyle, intensityTier?: ContentIntensity }` — `start(type, participants)` is satisfied by `createEncounter`.
- `src/rpg/encounters/service/crud.ts` — `createEncounter` enforces the NSFW capability gate (rating + consent) via `assertNsfwCapability` before INSERT; bypassing throws `CapabilityBlockedError`. Persists to `nsfw_encounter` rows (TASK-036 persistence contract).
- `src/rpg/encounters/service/phases.ts` — `advancePhase` is event-driven: each transition writes a row to `nsfw_encounter_events` (append-only) carrying `{ encounterId, fromPhase, toPhase, ts, actorId }`. The current phase reads from the latest event, so phase transitions are append-only events, not in-place mutations.
- `src/rpg/encounters/service/participant-legs.ts` — `complete` (via `applyOutcomes`) calls the fan-out: IntimacyService.applyAction → SeductionService.settle → BodySystemService.getPhysicalStatus → ReproductionService.rollFromEncounter → ReputationService.applyEncounterReputation → MoodService.logEvent. Each downstream consumer is wired through its canonical service, never duplicated.
- `src/rpg/encounters/service/reputation-leg.ts` — encounter completion path that emits `nsfw.reputation_changed` per-actor (TASK-042 fan-out), consumed by the canonical `ReputationScore` writer.
- `src/rpg/encounters/service/venue.ts` — location/venue lookup with NSFW rating + consent gate (TASK-043 wired through encounter start; deliberately deferred to a follow-up ticket for the venue UI surface).
- `src/db/enums-character/nsfw.ts:NsfwEncounterType` — enum family (`Romantic / Passionate / Experimental / Rough / Tender / Exhibitionist / Voyeuristic / Fetishist / Group / Anonymous / Other`). Phase ordering per type is driven by `nsfwEncounterStatusMachine` (TASK-036 state machine, `Active → Completed`); custom ordering must extend the enum + machine, not hard-code branches.
- `src/db/enums-character/nsfw.ts:HeatPhase` — heat cycle states reused by `BodySystemService.advanceHeatCycle` (TASK-035) and `ReproductionService.rollFromEncounter` (TASK-038).
- `src/db/enums-character/nsfw.ts:NarrativeStyle` — `FadeToBlack / Implied / Explicit`. Encounter outcomes respect this in the post-encounter event payload (Open Q3): `fade_to_black` strips explicit detail from `EncounterOutcome.description`; `explicit` keeps it.
- `src/rpg/encounters/service/index.test.ts` and `venue.coverage.test.ts` — coverage of CRUD, phase append-only semantics, NSFW gate denial, narrative-style redaction, outcome fan-out.
- `src/rpg/encounters/service/types.ts` — `EncounterOutcome { type, outcome: 'success' | 'failure' | 'partial', participants: string[], effects: OutcomeEffects, narrativeStyle: NarrativeStyle }`.

Acceptance criteria checklist:

- [x] `src/rpg/encounter.ts` exposes `EncounterService` with `createEncounter(type, participants)` (the `start` semantic), `advancePhase(encounterId)`, and `deleteEncounter` / `complete` flow.
- [x] `NsfwEncounterType` enum drives phase ordering through `nsfwEncounterStatusMachine`; new types extend the enum + machine (TASK-036 contract).
- [x] `nsfw.encounter_completed` event payload is `{ type, outcome, participants, effects, narrativeStyle }`; downstream consumers (Disease via complications, ReputationService, XPService, Social) read it via the fan-out in `applyOutcomes`.
- [x] Encounter state persists to `nsfw_encounter`; phase transitions are append-only rows in `nsfw_encounter_events` — no in-place mutations.
- [x] All start paths check the NSFW capability gate; bypassing throws `CapabilityBlockedError` (verified by `index.test.ts`).

Open Question #3 (narrative style): wired. `NarrativeStyle` is part of the encounter opts and gates `EncounterOutcome.description` exposure; `FadeToBlack` redacts explicit detail before any consumer sees it.
