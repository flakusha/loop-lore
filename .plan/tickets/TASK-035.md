<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-035: NSFW Body & Physical Systems

**Status:** open
**Priority:** medium
**Effort:** Large
**Summary:** Body/physical on BodyBuild + SizeCategory via shared StatusEffect.
**Context:** Gameplay-layer physique; stamina/endurance mechanics.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
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
