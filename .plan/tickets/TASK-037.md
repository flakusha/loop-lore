<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-037: NSFW Fantasy & Kink System

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** medium
**Effort:** Large
**Epic:** epic-nsfw-game-mechanics.md
**Tags:** nsfw-game-mechanics
**Summary:** Fantasy/kink on FantasyCategory with content-warning triggers.
**Context:** Gameplay-layer fantasy discovery + fulfillment.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
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


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Note: the fantasy API uses `createFantasy / recordExploration / attemptDiscovery / fulfillFantasy / getActorFantasies / getByCategory` rather than the literal `disclose / fulfill / list`; the call shape carries actor/target/category as the spec describes.

- `src/rpg/fantasy.ts` — thin barrel re-exporting `./fantasies`.
- `src/rpg/fantasies/service/index.ts` — `FantasyService` class with `createFantasy(opts: CreateFantasyOpts) → Fantasy` (the `disclose` semantic), `attemptDiscovery(opts) → DiscoveryResult`, `fulfillFantasy(opts) → FulfillmentEffects` (the `fulfill` semantic), `getActorFantasies(actorId) → Fantasy[]` (the `list` semantic), `getByCategory(category)`, `recordExploration`, `deleteFantasy`.
- `src/rpg/fantasies/service/crud.ts` — `createFantasy` persists `(actor_id, target_id, category, intensity, disclosed_at)` rows. The `actor_id → target_id` keying is the per-target relationship (TASK-037 disclosure-key contract); fantasies are not global.
- `src/rpg/fantasies/service/discovery.ts` — `attemptDiscovery(opts) → DiscoveryResult { triggered: boolean, category: FantasyCategory, warning?: ContentWarning }`. Discovery is gated by `ContentIntensity` tier from `src/nsfw/capability-gate.ts`; extreme `FantasyCategory` values (those beyond the configured tier) emit a `nsfw.content_warning` event row before fulfillment. Verified by `discovery.test.ts`.
- `src/rpg/fantasies/service/fulfill.ts` — `fulfillFantasy(target, category)` consumes `MoodService.logEvent({ eventType: 'fantasy.fulfilled' })` for the post-fulfill mood hit; pairs with IntimacyService.applyAction for the intimacy delta. The `nsfw.content_warning` event fires once per (target, category, threshold-cross) tuple, never on no-op re-fulfillments.
- `src/db/enums-character/nsfw.ts:FantasyCategory` — enum family (`PowerExchange / Exhibitionism / Voyeurism / Bondage / Domination / Submission / FetishWorship / Roleplay / Ageplay / PetPlay / CNC / ImpactPlay / Other`). Ad-hoc strings reject at the TypeBox schema boundary; new categories extend the enum.
- `src/rpg/fantasies/service/types.ts` — `Fantasy { actorId, targetId, category, intensity, disclosedAt, lastFulfilledAt }` per-target relationship shape (TASK-037 contract).
- `src/rpg/fantasies/service/index.test.ts` and `discovery.test.ts` — coverage of CRUD, per-target keying, content-warning emission, mood follow-through.
- `src/rpg/seduction/service/desire.ts` — reads fantasy flags via `fantasies/service/crud:getByCategory` for the turn-on/turn-off lookup (TASK-037 consumer); never re-parses fantasy state.

Acceptance criteria checklist:

- [x] `src/rpg/fantasy.ts` exposes `FantasyService` with `createFantasy(actor, target, category)` (the `disclose` semantic), `fulfillFantasy(target, category)`, and `getActorFantasies(actor)` (the `list` semantic).
- [x] `FantasyCategory` values extend the enum (`src/db/enums-character/nsfw.ts`); ad-hoc strings rejected at the TypeBox schema boundary.
- [x] Extreme categories (beyond configured tier) emit `nsfw.content_warning` event before fulfillment; verified by `discovery.test.ts`.
- [x] Disclosure is per-target (`actor_id + target_id` composite key on `character_fantasies` rows), not global.
- [x] Seduction (TASK-034) reads fantasy flags via `desire.ts → fantasies/service/crud:getByCategory`; no re-parsing.

Open Question #5 (content warnings): wired. `nsfw.content_warning` event row is written when `category` exceeds `ContentIntensity` tier at fulfillment time; `FadeToBlack` consumers receive the warning as part of the post-encounter event payload rather than inline detail.
