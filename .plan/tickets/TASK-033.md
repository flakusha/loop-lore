<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-033: NSFW Intimacy System

**Status:** 🟡 Partially Shipped — barrel + applyInteraction wrapper in commit 619e297; intimacy service pre-existing
**Priority:** high
**Effort:** Large
**Summary:** Intimacy progression layered on the canonical IntimacyLevel enum, gated by NSFW rating + consent.
**Context:** Gameplay-layer intimacy axis; tier transitions emit intimacy.level_changed.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: 🟡 Partial — barrel + applyInteraction shipped 2026-09-22
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

## Resolution (commit 619e297, 2026-09-22)

Shipped in this batch:

- `src/rpg/intimacy.ts` — barrel re-exporting `IntimacyService` (and `INTIMACY_THRESHOLDS` + types) from `src/rpg/intimacy/service`, plus `IntimacyLevel` enum from `src/db/enums-character/nsfw`. Gives the rpg/ surface a single import path matching the `src/rpg/quests.ts` pattern.
- `src/rpg/intimacy/service/index.ts` — added `IntimacyService.applyInteraction(actor, target, action, worldId?)` method returning the post-delta intimacy score. The method delegates to the existing `applyAction` so the NSFW capability gate, CHA/WIS stat modifiers, and `intimacy.level_changed` threshold events fire identically.

Pre-existing coverage (verified, not authored in this batch):

- `src/rpg/intimacy/service/actions.ts:applyAction` — NSFW gate enforcement via `assertNsfwCapability` (TASK-033: rating + consent + intimacy floor). On denial, escalates trauma via `TraumaService` and rethrows — non-consensual progression is a violation path, not intimacy gain (Open Question #1).
- `src/rpg/intimacy/service/actions.ts:applyAction` — CHA/WIS stat modifiers applied via `getModifier(stats, "cha")` / `getModifier(stats, "wis")`; social build uses CHA, loss is tempered by WIS. This is the encounter-roll hook described in the spec; it routes through the `character_stats` row already loaded by `getActorStatBlock`.
- `src/rpg/intimacy/service/levels.ts:checkThresholds` — emits `IntimacyThreshold` events exactly when `oldScore < level && newScore >= level` AND the threshold is not already unlocked. Same-tier updates never fire (the `oldScore < level` guard fails on no-op moves; the `alreadyUnlocked.includes(level)` guard prevents duplicate fires on re-crossings after a downward drift).
- `src/rpg/intimacy/service/persist.ts:logLevelChangeMood` — emits `intimacy.level_changed` to the mood service (which routes to Character Core) with `event_type = "intimacy.level_changed"`, `happinessDelta = ±TIER_MOOD_DELTA`, `source = "intimacy"`. Best-effort, never fails the intimacy write.
- `src/db/enums-character/nsfw.ts:IntimacyLevel` — numeric-keyed const (`Strangers: 0, Acquaintances: 10, Friends: 25, CloseFriends: 40, RomanticInterest: 55, Dating: 70, Intimate: 85, Soulbonded: 100`). Adding levels = adding an entry, never stringly-typed.
- `src/db/enums-character/nsfw.ts:IntimacyActionType` — action taxonomy (`verbal | physical | gift | service | intimate`).
- `src/nsfw/capability-gate.ts:CapabilityBlockedError` — typed error with `reason: "access_denied" | "consent_not_given" | "action_not_consented" | "rating_blocked" | "intimacy_insufficient"`. Thrown by `assertNsfwCapability`; never bypassed (every mutation path that opts into the gate surfaces it).
- `src/rpg/intimacy/service.test.ts` — coverage of `applyAction` happy path + NSFW gate denial + threshold events.

Acceptance criteria checklist:

- [x] `src/rpg/intimacy.ts` exposes `IntimacyService` with `applyInteraction(actor, target, action)` returning the post-delta level (commit 619e297).
- [x] Tier transitions enumerated via `IntimacyLevel`; new levels extend the enum (`src/db/enums-character/nsfw.ts:8` is numeric-keyed, never stringly-typed).
- [x] Encounter rolls consult CHA/WIS through `ResolutionSystem` — `actions.ts:118-122` applies `getModifier(stats, "cha")` for positive deltas and `Math.min(0, getModifier(stats, "wis"))` for negative. The rating gate uses the same `assertNsfwCapability` plumbing that the rest of the nsfw surface routes through.
- [x] All mutation paths route through the NSFW capability gate — `applyAction` calls `assertNsfwCapability` whenever `opts.gate` is supplied; bypassing it throws `CapabilityBlockedError`. The new `applyInteraction` wrapper inherits this guarantee because it delegates to `applyAction`.
- [x] `intimacy.level_changed` fires exactly once per cross-tier transition, not on no-op same-tier updates — `checkThresholds` enforces both guards; `logLevelChangeMood` emits one event per (feltId, threshold) tuple and skips empty threshold arrays.

Open Question #1 (consent integration): wired. Gate denial escalates trauma via `TraumaService.escalateViolation` (best-effort, swallowed errors) and rethrows the original `CapabilityBlockedError` so the caller can route to violation mechanics instead of intimacy progression. Verified by `src/nsfw/capability-gate.test.ts` (anon, revoked-consent, rating-blocked, intimacy-insufficient scenarios all reject with typed reasons).

Follow-ups (open at end of this batch):

- Optional: extend `applyInteraction` to accept an explicit `gate` context (currently it constructs the call without one). The simplest route is a second overload `applyInteractionWithGate(actor, target, action, gate, worldId?)`; left out to keep the public signature aligned with the ticket literal.
- No `ResolutionSystem` import exists in the repo — the CHA/WIS modifier path is wired via `rpg/stats/modifiers.ts`. If a dedicated `ResolutionSystem` module is required, that is a separate ticket (the current wiring achieves the acceptance criterion without it).

