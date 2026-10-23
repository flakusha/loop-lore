<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Integrate skill progression with LevelService as one guarded award pipeline

**Status:** Done
**Status Note:** character XP (`xp_ledger` + `character_stats`) and skill-row XP (`SkillsService.addXp`, `src/rpg/skills/service/progression.ts:19`) share no award path on dev; work in branch `xp-level-pipeline`; verified 2026-10-23
**Priority:** medium
**Effort:** Medium
**Caveats:** data races — the fan-in must serialize the two stores in one transaction or a crash between them leaves the stores disagreeing
**Epic:** epic-character-xp-leveling
**Tags:** rpg, xp, skills
**Related:** .plan/tickets/FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md (the character-XP pipeline this extends), .plan/tickets/TASK-rpg-skill-points-on-level-up.md (skill-point currency reconciliation)

**Summary:**

Character XP and skill-row XP are disjoint stores with no shared award path or world gating: character XP lives in `xp_ledger` (`logXp`/`getXpHistory`, `src/rpg/service/xp.ts:22,52`) and `character_stats` (mutable only through `updateCharacterStats`, `src/rpg/service/character-stats.ts:192-242`, whose `level`/`xp`/`xp_to_next` params are passed straight from the request body by `PATCH /api/rpg/stats/:actorId`, `src/routes/rpg/stats-actor.ts:159-161`), while skill rows progress via `SkillsService.addXp` (`src/rpg/skills/service/progression.ts:19`). Define one guarded pipeline: the LevelService award API accepts a `worldId`, checks `checkMechanicEnabled(db, worldId, RpgMechanic.Xp)` (`src/rpg/service/world-gate.ts:153`), and fans out to `character_stats` and `character_skills`; skill level-ups recompute proficiency (`src/rpg/skills/service/helpers.ts:45`) and emit `growth_log` audit events consistent with epic-character-growth D10 (the `acquired_at`/`acquisition_reason`/`acquisition_source` columns, `src/db/schema-core.ts:483-485`). Reconcile with `TASK-rpg-skill-points-on-level-up.md` so its config-driven skill points and this epic's ASI budget (`src/rpg/xp/constants.ts:55,58`) do not become competing point currencies, and subsume the manual PATCH `level`/`xp` fields so progression mutates only through the guarded service.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue 89fef2a (registry tip: 93d01ea7d Konstantin Fedotov Close issue)
