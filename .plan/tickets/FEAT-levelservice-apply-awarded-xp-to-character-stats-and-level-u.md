<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: LevelService: apply awarded XP to character_stats and level-up benefits

**Status:** Done
**Status Note:** shipped on dev — `awardXpToActor` at `src/rpg/level/service.ts:49` (level-up benefits via `src/rpg/level/award.ts:117-119`), 5 production callers; verified 2026-10-23
**Priority:** high
**Effort:** Medium
**Caveats:** idempotency — repeat awards are separate `xp_ledger` rows (no dedupe key); partial failure — `awardXpToActor` throws on invalid amounts (NaN/negative/Infinity) so callers must guard
**Epic:** character-xp-leveling
**Related:** .plan/tickets/FEAT-battle-rewards-grant-character-xp-on-enemy-defeat.md (first consumer — grants via this service), .plan/tickets/FEAT-automatic-organic-stat-growth-and-allocatable-ability-points.md (extends the level-up bookkeeping with ASI allocation)

**Summary:**

Central LevelService: given an actor, read/ensure `character_stats`, compute `awardXp(current level, xp, amount)` + `xpToNextLevel`, persist new level/xp/xp_to_next, and (when `canLevelUp` flips) apply level-up benefits — `hpOnLevelUp(hit_dice die, CON mod)` and `grantsAsi`/`asiRemaining` bookkeeping (`ASI_LEVELS` [4,8,12,16,19], `ASI_MAX` 20; `src/rpg/xp/constants.ts:55`). Sources: `src/rpg/xp/calculation.ts:72` (awardXp), `src/rpg/xp/levelup.ts:15-46`, `src/db/schema-core.ts:488` (character_stats columns incl. xp/xp_to_next, frozen since creation via `src/rpg/service/character-stats.ts:45`), `src/routes/rpg/xp-loot.ts:47-88` (route currently forces callers to pass currentLevel/currentXp). Should expose an internal API other services call and subsume the ad-hoc currentLevel/currentXp route parameters. Keep `xp_ledger` as the audit trail (`src/rpg/service/xp.ts:22`); a test must pin that NaN/negative/Infinity amounts are rejected (the seduction service tests document these currently slip through: `src/rpg/seduction/service.test.ts:181-223`).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue 319ce79 (registry tip: 07ebd71d9 Konstantin Fedotov Auto-closed: appended .md marker marks FEAT-LEVELSERVICE-APPLY-AWARDED-)
