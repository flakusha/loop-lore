<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-039: NSFW Pheromones & Chemistry

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Pheromones/chemistry as shared StatusEffect consumed by Seduction/Encounter/Disease.
**Context:** Gameplay-layer aphrodisiacs + heat-cycle chemistry.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
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
