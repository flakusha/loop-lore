<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-042: NSFW Reputation & Social

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-nsfw-game-mechanics.md
**Tags:** nsfw-game-mechanics
**Summary:** Reputation on shared ReputationScore + reputation_changed event.
**Context:** Gameplay-layer social consequences feeding faction/crime.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
**Priority**: medium
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Reputation/social consequences layered on shared `ReputationScore`; cross-system event drives Social/Faction standing.

## Context

Implements NSFW reputation on the shared `ReputationScore` model consumed by Social/Crime/Faction. Rumors and social consequences are derived events, not a parallel NSFW reputation store. All paths respect `ContentIntensity` tier from epic-nsfw-capabilities. Cross-system event `nsfw.reputation_changed` emits to Social + Faction.

## Acceptance Criteria

- `src/rpg/reputation.ts` exposes `ReputationService` with `applyDelta(actor, source, delta)`, `getScore(actor, axis)`
- Reputation writes target the shared `ReputationScore` model; no NSFW-private reputation table
- `nsfw.reputation_changed` event payload is {actor, axis, delta, source} and is consumed by Social/Faction without bespoke wiring
- Rumors are derived by replaying reputation deltas through the existing rumor pipeline, not stored separately
- Public perception events follow the same publish path as non-NSFW reputation events

## Related Files

- `src/rpg/reputation.ts` (speculative — file may not exist yet)
- `src/social/reputation.ts` — canonical reputation model (consumer)
- `src/db/enums-character/nsfw.ts` — content intensity enum
- `src/faction/` — downstream consumer of reputation events
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #9 (multiplayer) directly bounds this system — reputation deltas must apply consistently per-character, not collapse into a global faction score.


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Reputation writes target the shared `ReputationScore` value object at `src/schemas/reputation.ts`; durable per-actor state lives in `status_effect` rows (`category: "reputation"`, `source: "nsfw"`). Social/Faction consume through the canonical pipeline — no NSFW-private reputation table. Rumors derive by replaying those rows; never stored separately. Per-character deltas only, never collapsed into a global faction score (Open Q9).

- `src/rpg/reputation.ts` — `ReputationService` class with `applyDelta(actorId, source, delta, axis='private'|'public'|'group') → ReputationScore` (TASK-042 literal), `getScore(actorId, axis?, source='nsfw') → ReputationScore`, `deriveRumors(actorId) → string[]` (TASK-042 rumor-derivation contract), `applyEncounterReputation(encounterId, actorId, success, socialContext, intimacyLevel) → ReputationScore`. Constructor takes `Kysely<DB>`.
- `src/rpg/reputation.ts:applyDelta` — writes a `status_effect` row with `category: "reputation"`, `effectId: '<source>'`, `magnitude: delta`, `meta: { axis, source }`. The `nsfw.reputation_changed` payload `{ actor, axis, delta, source }` travels in the row meta (TASK-042 payload contract); Social/Faction consume by reading rows.
- `src/rpg/reputation.ts:getScore` — replays the actor's `reputation` rows through `applyCanonicalChange` from `src/schemas/reputation.ts` (canonical `ReputationScore` calculator). Social and Faction see the same deltas without bespoke wiring (TASK-042 cross-system contract).
- `src/rpg/reputation.ts:deriveRumors` — replays reputation rows through the existing rumor pipeline (`src/social/rumors.ts`). Rumors are derived events; they are not stored separately (TASK-042 derived-event contract).
- `src/rpg/reputation.ts:applyEncounterReputation` — public-perception entry point that calls `calculateEncounterReputationChange` from `src/nsfw/social-integration.ts`; same publish path as non-NSFW reputation events (TASK-042 same-publish-path contract).
- `src/schemas/reputation.ts` — canonical `ReputationScore`, `applyReputationChange`, `createReputationScore`, `getReputationTier`. Owned by Social/Faction; NSFW `ReputationService` consumes via `applyCanonicalChange`.
- `src/rpg/encounters/service/participant-legs.ts:applyOutcomes` and `src/rpg/encounters/service/reputation-leg.ts` — encounter completion calls `ReputationService.applyEncounterReputation` per-actor (TASK-036 → TASK-042 fan-out). Each participant's delta is computed independently; no global faction rollup (Open Q9).
- `src/social/reputation.ts` and `src/faction/` — read `ReputationScore` through the canonical schema; NSFW callers produce the same shape as non-NSFW callers.
- `src/rpg/reproduction-reputation.test.ts` — coverage of `applyDelta`, `getScore`, `deriveRumors`, per-axis isolation, and the encounter-completion fan-out (also exercised by `src/rpg/reproduction.ts` integration).

Acceptance criteria checklist:

- [x] `src/rpg/reputation.ts` exposes `ReputationService` with `applyDelta(actor, source, delta, axis?)` and `getScore(actor, axis?)`.
- [x] Reputation writes target the shared `ReputationScore` model (`status_effect` rows replayed through `src/schemas/reputation.ts:applyCanonicalChange`); no NSFW-private reputation table.
- [x] `nsfw.reputation_changed` event payload `{ actor, axis, delta, source }` travels in the `status_effect` row meta; Social/Faction read it without bespoke wiring.
- [x] Rumors derive by replaying reputation rows through `src/social/rumors.ts` (`deriveRumors(actorId) → string[]`); never stored separately.
- [x] Public perception events (`applyEncounterReputation`) follow the same publish path as non-NSFW reputation events via `calculateEncounterReputationChange`.

Open Question #9 (multiplayer / per-character): settled. `applyEncounterReputation` and the participant-leg fan-out compute per-actor deltas; the canonical `ReputationScore` calculator operates on the actor's own row set. There is no global faction rollup step — Faction derives standing by reading each actor's score, not by aggregating NSFW deltas into a single global value.
