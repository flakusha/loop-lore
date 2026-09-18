<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-036: NSFW Encounter System

**Status:** open
**Priority:** high
**Effort:** Very High
**Summary:** Encounter state machine on NsfwEncounterType + HeatPhase; encounter_completed event.
**Context:** Gameplay-layer encounter phases + skill checks + outcomes.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: high
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

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
