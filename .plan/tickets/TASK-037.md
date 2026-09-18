<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-037: NSFW Fantasy & Kink System

**Status:** open
**Priority:** medium
**Effort:** Large
**Summary:** Fantasy/kink on FantasyCategory with content-warning triggers.
**Context:** Gameplay-layer fantasy discovery + fulfillment.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Fantasy/kink discovery layered on `FantasyCategory`; gated by NSFW rating + consent and content-warning triggers.

## Context

Implements fantasy disclosure and fulfillment on `FantasyCategory` in `src/db/enums-character/nsfw.ts`. Discovery is gated by `ContentIntensity` tier from epic-nsfw-capabilities; extreme kinks may trigger content warnings per Open Question #5. Turn-on/turn-off flags from this system are consumed by Seduction (TASK-034) and Encounter (TASK-036).

## Acceptance Criteria

- `src/rpg/fantasy.ts` exposes `FantasyService` with `disclose(actor, category)`, `fulfill(target, category)`, `list(actor)`
- `FantasyCategory` values extend the canonical enum; ad-hoc strings rejected at the schema boundary
- Extreme categories (those exceeding the configured rating tier) emit a `nsfw.content_warning` event before fulfillment
- Disclosure is a per-target relationship, not global — fantasy state is keyed on the actor→target edge
- Seduction (TASK-034) reads fantasy flags via service call, not by re-parsing fantasy state

## Related Files

- `src/rpg/fantasy.ts` (speculative — file may not exist yet)
- `src/db/enums-character/nsfw.ts` — `FantasyCategory` enum
- `src/schemas/nsfw-rating.ts` — content intensity tier schema
- `src/rpg/seduction.ts` — downstream consumer of turn-on/turn-off flags
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #5 (content warnings) is the gating boundary for extreme `FantasyCategory` values; categories beyond the configured tier must surface warnings, not silently filter.
