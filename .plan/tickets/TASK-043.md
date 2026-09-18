<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-043: NSFW Location & Environment

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Location on NsfwLocationType + Housing private bonuses + Weather atmosphere.
**Context:** Gameplay-layer location atmosphere modifiers.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Location/environment layered on `NsfwLocationType`; private-space bonuses from Housing; weather atmosphere.

## Context

Implements location filtering on `NsfwLocationType` in `src/db/enums-character/nsfw.ts`. Location availability consults Housing for private-space bonuses and Weather for atmosphere modifiers. All paths respect `ContentIntensity` tier from epic-nsfw-capabilities. Cross-system event `housing.nsfw_encounter` subscribes from Housing.

## Acceptance Criteria

- `src/rpg/location.ts` exposes `LocationService` with `listAvailable(actor)`, `resolveAtmosphere(locationId)`, `isPrivate(locationId)`
- `NsfwLocationType` values extend the canonical enum; ad-hoc location strings rejected
- Private-space bonuses resolve via the Housing service interface, not a duplicate housing query
- Weather atmosphere modifiers come from the Weather event subscription (`weather.changed`); no parallel weather cache
- Encounters (TASK-036) accept a `locationId` and apply atmosphere modifiers through this service

## Related Files

- `src/rpg/location.ts` (speculative — file may not exist yet)
- `src/db/enums-character/nsfw.ts` — `NsfwLocationType` enum
- `src/housing/` — private-space bonus source
- `src/world/weather.ts` — atmosphere modifier source
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #10 (modding) is most relevant here: location types should be extensible by plugins via the standard enum-extension API, not require core edits.
