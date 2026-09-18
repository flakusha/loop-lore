<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-042: NSFW Reputation & Social

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Reputation on shared ReputationScore + reputation_changed event.
**Context:** Gameplay-layer social consequences feeding faction/crime.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
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
