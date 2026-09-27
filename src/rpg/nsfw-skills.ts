// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/nsfw-skills.ts — barrel for NSFW skill XP + checks.
 *
 * TASK-040: NSFW skill XP flows through the same shared `SkillsService`
 * (`src/rpg/skills/service/`) as core-combat skills — there is no separate
 * `NsfwSkillService` class (TASK-040 Resolution block documents this
 * honestly). This barrel re-exports the shared `SkillsService` and the
 * `SeductionSkillCategory` enum so NSFW callers can import the NSFW-categorised
 * subset from `rpg/nsfw-skills` rather than reaching into the shared
 * `rpg/skills` module. XP grants from `rpg/seduction/service/skills.ts:awardXp`
 * and `rpg/encounters/service/participant-legs.ts:applyOutcomes` continue to
 * route through `SkillsService.addXp` → `xpService.grantXp` (shared ledger).
 */
export { SeductionSkillCategory, } from "../db/enums-character/nsfw";
export { SkillsService, } from "./skills/service";
export { ProficiencyLevel, SkillCategory, } from "./skills/service";
export type { CreateSkillInput, Skill, SkillTreeNode, UpdateSkillInput, XpGainResult, } from "./skills/service";
