<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-041: NSFW Mood & Emotional State

**Status:** open
**Priority:** high
**Effort:** Medium
**Summary:** Mood on Character Core primitives + StatusEffect bridge.
**Context:** Gameplay-layer mood modifiers feeding intimacy/seduction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: high
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Mood/emotional state layered on character mood primitives; arousal/mood interaction via shared `StatusEffect`.

## Context

Implements mood deltas on top of the Character Core mood model (no private NSFW mood store). Arousal intersects mood through the shared `StatusEffect` model consumed by RPG/Battle/Disease. All paths respect `ContentIntensity` tier from epic-nsfw-capabilities and the consent token from epic-nsfw-capabilities.

## Acceptance Criteria

- `src/rpg/mood.ts` exposes `MoodService` with `applyDelta(actor, source, delta)`, `getMood(actor)`
- Mood state lives in Character Core (`src/character/mood.ts`), not in an NSFW-private store
- Arousal→mood cross-effects route through `StatusEffect`, not bespoke coupling
- Seduction/Encounter outcomes call `applyDelta` with a structured source tag (`seduction.success`, `encounter.completed`, ...)
- Mood reports are returned via the Character Core API; NSFW callers receive the same shape as non-NSFW callers

## Related Files

- `src/rpg/mood.ts` (speculative — file may not exist yet)
- `src/character/mood.ts` — canonical mood primitive (consumer)
- `src/db/schema/status-effect.ts` — arousal→mood bridge
- `src/db/enums-character/nsfw.ts` — arousal enum family
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #8 (memory impact) matters most here: mood deltas from NSFW encounters must persist in the long-term character memory pipeline, not be ephemeral session state.
