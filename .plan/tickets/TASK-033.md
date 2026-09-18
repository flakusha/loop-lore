<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-033: NSFW Intimacy System

**Status:** open
**Priority:** high
**Effort:** Large
**Summary:** Intimacy progression layered on the canonical IntimacyLevel enum, gated by NSFW rating + consent.
**Context:** Gameplay-layer intimacy axis; tier transitions emit intimacy.level_changed.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: high
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Intimacy progression layered on the canonical `IntimacyLevel` enum drives relationship thresholds, gated by NSFW rating + consent.

## Context

Builds the intimacy-axis state machine on `IntimacyLevel` in `src/db/enums-character/nsfw.ts`. Reads consent token + `ContentIntensity` tier from the upstream epic-nsfw-capabilities gate (rating + consent must both pass before any intimacy delta is computed). Cross-system event `intimacy.level_changed` emits to Social + Character Core.

## Acceptance Criteria

- `src/rpg/intimacy.ts` exposes `IntimacyService` with `applyInteraction(actor, target, action)` returning the post-delta level
- Tier transitions (`stranger` → `familiar` → `intimate` → ...) are enumerated via `IntimacyLevel`; new levels must extend the enum, not be stringly typed
- Encounter rolls consult CHA/WIS stats through `ResolutionSystem` so intimacy gains respect seduction/defense skill checks
- All mutation paths route through the NSFW capability gate (rating + consent) — bypassing it must throw `CapabilityBlockedError`
- `intimacy.level_changed` event fires exactly once per cross-tier transition, not on no-op same-tier updates

## Related Files

- `src/rpg/intimacy.ts` (speculative — file may not exist yet)
- `src/db/enums-character/nsfw.ts` — `IntimacyLevel` enum family
- `src/schemas/nsfw-rating.ts` — content intensity tier schema
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section
- `src/nsfw/moderation-service/` — upstream rating + consent gate

## Notes

Open Question #1 (consent integration) is the gating boundary for this system; non-consensual interactions must short-circuit to violation mechanics instead of intimacy progression.
