<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Skill usage XP: award skill and character XP when skills are exercised

**Status:** in_progress
**Status Note:** no `addXp`/`SkillsService` caller in `src/rpg/interaction/` on dev; work in branch `xp-reward-sources`; verified 2026-10-23
**Priority:** medium
**Effort:** Medium
**Caveats:** partial failure — skill-row and character XP stay disjoint until the fan-in ticket lands, so exercising a skill currently grants neither
**Epic:** epic-character-xp-leveling
**Tags:** rpg, xp, skills
**Related:** .plan/tickets/FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md (character-XP grants persist through this service), .plan/tickets/BUG-addxp-accepts-negative-xp-producing-nan-level-stored-in-db.md (prerequisite — validate XP input before wiring new awarders)

**Summary:**

No production path awards skill-row XP on `character_skills` today: `SkillsService.addXp` (`src/rpg/skills/service/progression.ts:19`) is reachable only through the manual route `POST /api/rpg/skills/:id/xp` (`src/routes/rpg/skills-progression.ts:129-134`) and tests. The only live awarders write other stores: seduction `awardXp` writes the separate world-scoped `character_seduction_skills` table (`src/rpg/seduction/service/skills.ts:92-139`; `src/db/schema-character.ts:270`, world_id index `src/db/migrations/001_init.ts:1633-1635`) while mirroring character XP to `xp_ledger` (`src/rpg/seduction/service/settle.ts:69-78`), and the encounter leg writes `xp_ledger` only (`src/rpg/encounters/service/participant-legs.ts:97-113`, source `nsfw_encounter`, only when `satisfactionBonus > 0`). This ticket wires generic skill exercise — interaction skill checks (chat command path behind `checkCommandMechanic`, cf. `src/assistant/commands/interaction.ts:123`), crafting process rolls (`src/rpg/crafting/process.ts`), and future skill-check commands — to (a) skill-row XP via `SkillsService.addXp` and (b) character XP through the LevelService (sibling FEAT), with `xp_ledger` source `skill_use` and `reference_id` idempotency (pattern: `quest_reward_ledger.ledger_key`, `src/rpg/loot/persist.ts:95-123`). Prerequisite: input validation per the BUG — `addXp` accepts negative values today and `calculateLevel` (`src/rpg/skills/service/helpers.ts:35-38`) returns NaN for negative xp.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
