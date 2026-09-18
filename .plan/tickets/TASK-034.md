<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-034: NSFW Seduction & Desire System

**Status:** open
**Priority:** high
**Effort:** Large
**Summary:** Seduction on SeductionSkillCategory + ArousalLevel, routed through ResolutionSystem.
**Context:** Gameplay-layer seduction; skill checks use CHA/WIS.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
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
