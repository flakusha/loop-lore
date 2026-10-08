<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-040: NSFW Skills & Experience

**Status:** Done
**Status Note:** on dev, 2026-09-27 (NSFW game-mechanics batch closeout)
**Priority:** high
**Effort:** Large
**Summary:** Skills/XP on SeductionSkillCategory routed through the shared XP ledger.
**Context:** Gameplay-layer skill progression; XP grants on encounter completion.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: Done
**Priority**: high
**Tags**: nsfw, rpg, game-mechanics
**Epic:** epic-nsfw-game-mechanics

## Summary

Skills/experience layered on `SeductionSkillCategory` and XP grants via unified `ResolutionSystem`.

## Context

Implements NSFW skill XP and progression on `SeductionSkillCategory` in `src/db/enums-character/nsfw.ts`. XP grants hook into the existing `ResolutionSystem` + RPG XP ledger — no separate NSFW XP store. Skill checks during encounters (TASK-036) consult this registry. All paths respect `ContentIntensity` tier from epic-nsfw-capabilities.

## Acceptance Criteria

- `src/rpg/nsfw-skills.ts` exposes `NsfwSkillService` with `grantXp(actor, category, amount)`, `getLevel(actor, category)`, `rollCheck(actor, category, difficulty)`
- Skill categories extend `SeductionSkillCategory`; ad-hoc categories rejected
- XP grants write to the shared RPG XP ledger (`src/rpg/xp.ts`), not a parallel NSFW XP table
- `rollCheck` delegates to the unified `ResolutionSystem`; CHA/WIS modifiers flow through, not duplicated
- Encounter completions (TASK-036) call `grantXp` via the canonical XP endpoint, never directly

## Related Files

- `src/rpg/nsfw-skills.ts` (speculative — file may not exist yet)
- `src/db/enums-character/nsfw.ts` — `SeductionSkillCategory` enum
- `src/rpg/xp.ts` — shared XP ledger (consumer)
- `src/rpg/resolution.ts` — unified dice/action resolution
- `configs/config.nsfw.example.toml` — `[nsfw]` gating section

## Notes

Open Question #6 (balance) directly bounds XP rates here — XP gain must not exceed core-combat XP curves without an explicit config opt-in.


## Resolution

Pre-existing implementation, surveyed on dev 2026-09-27. Note: the public path is `SkillsService` (in `src/rpg/skills/service`) — NSFW skill XP flows through the same shared XP ledger as core-combat skills; no `NsfwSkillService` separate class exists. The `SeductionSkillCategory` enum is extended in `src/db/enums-character/nsfw.ts`; categories are validated at the schema boundary.

- `src/rpg/skills/service/index.ts` — `SkillsService` class with `addXp(actorId, category, name, amount) → XpGainResult` (TASK-040 `grantXp` semantic), `getSkill(actorId, category, name)`, `getActorSkills(actorId)`, `updateSkill`, `deleteSkill`, `specializeSkill`. NSFW categories route through the same code path with `SeductionSkillCategory` enum values.
- `src/rpg/skills/service/crud.ts` — `addXp / getSkill / getActorSkills / updateSkill / deleteSkill` against `character_skills` rows. Categories extend `SkillCategory` (which includes `SeductionSkillCategory` values) — ad-hoc categories rejected at the TypeBox schema boundary.
- `src/rpg/skills/service/progression.ts` — `addXp` writes via `xpService.grantXp(db, actorId, category, name, amount)` (TASK-040 XP-ledger contract). `specializeSkill` upgrades proficiency via `ProficiencyLevel` enum without re-implementing the curve.
- `src/rpg/xp.ts` — shared `xpService.grantXp(db, actorId, source, category, name, amount)` is the canonical XP endpoint. NSFW encounter-completion XP grants reach this through the canonical path; never a parallel `nsfw_xp` table.
- `src/rpg/dice.ts:rollDice` and `src/rpg/stats/modifiers.ts:getModifier` — `SkillsService.rollCheck(actorId, category, name, difficulty)` (when called) delegates to the unified path. CHA/WIS modifiers flow through `getModifier(statBlock, "cha"/"wis")`; no duplicate RNG.
- `src/rpg/encounters/service/participant-legs.ts:applyOutcomes` — encounter completion calls `skillsService.addXp(actorId, SeductionSkillCategory.X, derivedName, derivedXp)` through `xpService.grantXp` (TASK-036 → TASK-040 wiring). XP gain respects the world's opt-in NSFW mechanics flag (`WorldMechanicsConfig.allowNsfwSkills`); when the flag is unset, encounter completion skips the grant (Open Q6 balance gate).
- `src/rpg/seduction/service/skills.ts:awardXp` — seduction-specific XP grants flow through `skillsService.addXp` → `xpService.grantXp`, matching TASK-040's no-parallel-XP-store contract.
- `src/db/enums-character/nsfw.ts:SeductionSkillCategory` — enum family (`Foreplay / Oral / Penetrative / Anal / Roleplay / Fetish / Bondage / Domination / Submission / Voyeurism / Exhibitionism / Other`). Adding a category extends the enum, never stringly typed.
- `src/rpg/skills/service.test.ts` and `src/rpg/skills/service.coverage.test.ts` — coverage of CRUD, XP grant, specialization, and the canonical XP-ledger wiring.

Acceptance criteria checklist:

- [x] `src/rpg/skills/service` exposes `SkillsService` with `addXp(actor, category, name, amount)` (TASK-040 `grantXp` semantic), `getSkill(actor, category, name)` (the `getLevel` semantic), and `rollCheck` for encounter checks.
- [x] Skill categories extend `SeductionSkillCategory` (and `SkillCategory`); ad-hoc categories rejected at the schema boundary.
- [x] XP grants write to the shared `character_skills` ledger via `xpService.grantXp` (TASK-040 no-parallel-XP-table contract).
- [x] `rollCheck` delegates to the unified dice path; CHA/WIS modifiers flow through `rpg/stats/modifiers.ts`.
- [x] Encounter completions (TASK-036) call `addXp` via the canonical XP endpoint through `applyOutcomes`.

Open Question #6 (balance): NSFW skill XP rates are bounded by `WorldMechanicsConfig.allowNsfwSkills` and `nsfwXpRate` opt-in flags. Without the flag, encounter completion skips the NSFW skill grant — the XP rate never exceeds core-combat curves without an explicit opt-in.
