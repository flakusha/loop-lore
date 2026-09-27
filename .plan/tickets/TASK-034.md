<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-034: NSFW Seduction & Desire System

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** high
**Effort:** Large
**Summary:** Seduction on SeductionSkillCategory + ArousalLevel, routed through ResolutionSystem.
**Context:** Gameplay-layer seduction; skill checks use CHA/WIS.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
**Priority**: high
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

## Summary

Seduction/desire mechanics layered on `SeductionSkillCategory` and `ArousalLevel` enums, gated by NSFW rating + consent.

## Context

Implements seduction skill checks and arousal state changes on top of `SeductionSkillCategory` + `ArousalLevel` in `src/db/enums-character/nsfw.ts`. Skill checks resolve through the unified `ResolutionSystem` (CHA/WIS stats); arousal deltas respect `ContentIntensity` tier from epic-nsfw-capabilities. Cross-system event `intimacy.level_changed` is a downstream consumer.

## Acceptance Criteria

- `src/rpg/seduction.ts` exposes `SeductionService` with `attempt(actor, target, style)` returning {roll, result, arousalDelta}
- Style enum values map 1:1 to `SeductionSkillCategory` (`flirt`, `charm`, `taunt`, ...); adding a style requires an enum extension
- `ArousalLevel` updates clamp at the highest tier defined in `nsfw-rating.ts`; higher levels without the matching rating throw `CapabilityBlockedError`
- Dice rolls consume stat-driven modifiers from the unified resolution system (no bespoke RNG path)
- Turn-on/turn-off filters consume `FantasyCategory` flags from TASK-037 without re-parsing fantasy state

## Related Files

- `src/rpg/seduction.ts` (speculative — file may not exist yet)
- `src/db/enums-character/nsfw.ts` — `SeductionSkillCategory`, `ArousalLevel` enums
- `src/schemas/nsfw-rating.ts` — arousal ceiling per content tier
- `src/rpg/resolution.ts` — unified dice/action resolution consumer
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #7 (LLM prompts) directly affects how seduction outcomes are narrated; mechanics must hand the LLM a structured {result, arousalDelta} rather than free-form prose.


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27:

- `src/rpg/seduction.ts` — barrel re-exporting `SeductionService` from `src/rpg/seduction/service`. Same shape as the intimacy/quests barrel pattern.
- `src/rpg/seduction/service/index.ts` — `SeductionService` class with `attemptSeduction(opts)` returning `SeductionResult { roll, result, arousalDelta }`, `getSkill / getActorSkills / awardXp` for skill progression, `getArousal / modifyArousal / decayArousal / addModifier` for arousal state, `getDesireProfile / updateDesireProfile` for turn-on/turn-off storage. Constructor takes a `Kysely<DB>`.
- `src/rpg/seduction/service/attempt.ts` — `attemptSeduction` dispatcher: skill category → `SeductionSkillCategory`, dice roll via the unified `rpg/dice` (`rollDice`), CHA/WIS modifiers through `rpg/stats/modifiers.ts` (no bespoke RNG). Arousal delta written via `modifyArousal` which clamps at `AROUSAL_CEILING[intensityTier]` and throws `CapabilityBlockedError` above the tier (TASK-034 ceiling guard).
- `src/rpg/seduction/service/arousal.ts` — `AROUSAL_CEILING` per `ContentIntensity` (TASK-034 cap-per-tier contract). `modifyArousal(actorId, delta, worldId, source, intensityTier)` clamps and returns the post-delta level.
- `src/rpg/seduction/service/desire.ts` — desire profile reads `FantasyCategory` flags from the fantasies service (TASK-037) without re-parsing fantasy state; updates are partial `Pick<DesireProfile, ...>`.
- `src/rpg/seduction/service/skills.ts` — `awardXp(actorId, category, name, amount)` writes to the shared `character_skills` XP ledger (TASK-040 plumbing), levels via `progression.ts`.
- `src/rpg/seduction/service/settle.ts` — settles arousal change + mood follow-through (`MoodService.logEvent({ eventType: 'seduction.success' | 'seduction.failure' })`) without bespoke coupling. Intimacy delta is applied by the IntimacyService downstream; seduction only emits `{roll, result, arousalDelta}` for the LLM narrator (Open Q7).
- `src/db/enums-character/nsfw.ts:SeductionSkillCategory` — numeric-keyed const (`Foreplay / Oral / Penetrative / Anal / Roleplay / Fetish / Bondage / Domination / Submission / Voyeurism / Exhibitionism / Other`). Adding a style requires extending the enum, never stringly typed.
- `src/db/enums-character/nsfw.ts:ArousalLevel` — enum family used by `modifyArousal` and the mood bridge.
- `src/rpg/seduction/service/attempt.coverage.test.ts` — coverage of `attemptSeduction` happy + denial + ceiling overflow + skill-missing paths.

Acceptance criteria checklist:

- [x] `src/rpg/seduction.ts` exposes `SeductionService` with `attemptSeduction(actor, target, opts)` returning `{roll, result, arousalDelta}` (the opts shape carries actor/target/style; the result struct is the {roll, result, arousalDelta} literal).
- [x] Style values map 1:1 to `SeductionSkillCategory`; ad-hoc styles rejected at the schema boundary (TypeBox enum validation in routes).
- [x] `ArousalLevel` updates clamp at the tier-defined ceiling; higher levels without the matching rating throw `CapabilityBlockedError` via `assertNsfwCapability` (TASK-034 ceiling guard in `arousal.ts` + capability gate plumbing in `src/nsfw/capability-gate.ts`).
- [x] Dice rolls consume stat-driven modifiers from the unified resolution path (`rpg/stats/modifiers.ts: getModifier(stats, "cha"/"wis")`); no bespoke RNG.
- [x] Turn-on/turn-off flags consume `FantasyCategory` via service call (`getDesireProfile` → `fantasies/service/crud:getByCategory`); no re-parsing.

Open Question #7 (LLM narration): settled. `SeductionResult` is the structured payload the LLM consumes; no free-form prose synthesis in this layer.
