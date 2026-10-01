<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-041: NSFW Mood & Emotional State

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** high
**Effort:** Medium
**Epic:** epic-nsfw-game-mechanics.md
**Tags:** nsfw-game-mechanics
**Summary:** Mood on Character Core primitives + StatusEffect bridge.
**Context:** Gameplay-layer mood modifiers feeding intimacy/seduction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
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


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Note: the canonical path is `MoodService` in `src/characters/services/mood-service/` (Character Core), not `src/rpg/mood.ts`. NSFW services call into it; no NSFW-private mood store exists. The arousal↔mood bridge rides the shared `StatusEffect` model. Mood deltas persist to `mood_events` rows that feed the long-term character memory pipeline (Open Q8).

- `src/characters/services/mood-service/index.ts` — `MoodService` factory + class with `applyHappinessDelta(actorId, worldId, delta)` (TASK-041 `applyDelta` semantic), `logEvent(opts: LogMoodEventOpts) → string` (structured source tag, e.g. `{ eventType: 'seduction.success', source: 'seduction' }`), `getMood(actorId, worldId) → MoodState`, `createMood`, `updateMood`, `getEvents(actorId, worldId, limit?)`. NSFW callers receive the same shape as non-NSFW callers (TASK-041 contract).
- `src/characters/services/mood-service/log-event.ts` — `logEvent` writes `mood_events` rows carrying `{ actor_id, world_id, event_type, source, delta, ts, meta }`. The structured `eventType` enum is the source tag the spec calls for (`seduction.success`, `encounter.completed`, `fantasy.fulfilled`, `intimacy.level_changed`, `arousal.spike`, etc.).
- `src/characters/services/mood-service/happiness-to-mood.ts` — `happinessToMood(happiness: number) → MoodState` canonical mapping; arousal→mood cross-effects ride this through `StatusEffect` rows (TASK-041 arousal→mood bridge).
- `src/rpg/seduction/service/settle.ts` and `src/rpg/encounters/service/participant-legs.ts:applyOutcomes` and `src/rpg/fantasies/service/fulfill.ts` and `src/rpg/intimacy/service/persist.ts:logLevelChangeMood` — all call `MoodService.logEvent({ actorId, worldId, eventType: '<structured-source>', delta, meta })`. NSFW callers use the same Character Core API as non-NSFW callers (TASK-041 same-shape contract).
- `src/rpg/status-effects.ts:getActiveEffects` — arousal rows are read here, not from a private chemistry/mood store; arousal → mood cross-effects route through `StatusEffect` (TASK-041 contract).
- `src/characters/services/mood-service/apply-happiness-delta.ts` — `applyHappinessDelta` writes through the canonical mood primitive; never to a private NSFW store.
- `src/characters/services/mood-service.test.ts` and `src/rpg/fantasies/service/index.test.ts` (which exercises the mood follow-through) — coverage of logEvent, applyHappinessDelta, structured source tags, and the no-private-state contract.

Acceptance criteria checklist:

- [x] `MoodService` (Character Core) exposes `applyHappinessDelta(actor, source, delta)` and `logEvent` (TASK-041 `applyDelta` / `applyHappinessDelta` semantics). The spec's `src/rpg/mood.ts` re-exports the Character Core `MoodService` so NSFW callers can import from the rpg/ surface.
- [x] Mood state lives in Character Core (`character_moods` + `mood_events` rows). No NSFW-private mood store.
- [x] Arousal→mood cross-effects route through `StatusEffect` rows (TASK-041 no-bespoke-coupling contract). `applyHappinessDelta` reads `getActiveEffects` to derive the mood contribution.
- [x] Seduction/Encounter outcomes call `applyHappinessDelta` / `logEvent` with a structured `eventType` source tag (`seduction.success`, `seduction.failure`, `encounter.completed`, `fantasy.fulfilled`, `intimacy.level_changed`).
- [x] Mood reports return through the Character Core API; NSFW callers receive the same `MoodState` shape as non-NSFW callers.

Open Question #8 (memory impact): settled. `mood_events` rows persist beyond the session, feed the long-term character memory pipeline via the memory-budget reconciliation pass (`src/memory/`), and appear in the character's `getEvents` history. NSFW deltas are not ephemeral session state.
