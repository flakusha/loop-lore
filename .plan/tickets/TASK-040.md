<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-040: NSFW Skills & Experience

**Status:** open
**Priority:** high
**Effort:** Large
**Summary:** Skills/XP on SeductionSkillCategory routed through the shared XP ledger.
**Context:** Gameplay-layer skill progression; XP grants on encounter completion.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: high
**Labels**: nsfw, rpg, game-mechanics
**Epic**: epic-nsfw-game-mechanics

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
