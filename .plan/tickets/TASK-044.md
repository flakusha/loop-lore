<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-044: NSFW Trauma & Recovery

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Trauma/recovery as shared StatusEffect with consent-violation severity escalation.
**Context:** Gameplay-layer consequence system for non-consensual interactions.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Trauma/recovery modeled as shared `StatusEffect` family; respects consent token and `ContentIntensity`.

## Context

Implements trauma/recovery on the shared `StatusEffect` model consumed by Disease/Psychology systems. Recovery time and effects are derived from encounter outcome severity. All paths respect `ContentIntensity` tier from epic-nsfw-capabilities and the consent token — non-consensual encounters escalate trauma, not skip recovery.

## Acceptance Criteria

- `src/rpg/trauma.ts` exposes `TraumaService` with `applyTrauma(actor, severity)`, `advanceRecovery(actor)`, `getStatus(actor)`
- Trauma state is modeled as `StatusEffect` rows; no private trauma store
- Severity derives from `nsfw.encounter_completed` outcome, not from free-form LLM judgment
- Recovery time is time-driven via the existing status-effect scheduler
- Non-consensual encounters escalate trauma severity via the violation path from TASK-033's consent gate

## Related Files

- `src/rpg/trauma.ts` (speculative — file may not exist yet)
- `src/db/schema/status-effect.ts` — shared effect model
- `src/rpg/encounter.ts` — upstream severity source
- `src/disease/` — downstream consumer for complication cascades
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #1 (consent integration) is the gating boundary here — trauma/recovery must reflect non-consensual encounters distinctly from consensual ones.
