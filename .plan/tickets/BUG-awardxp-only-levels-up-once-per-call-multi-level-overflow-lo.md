<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: awardXp only levels up once per call (multi-level overflow lost)

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — awardXp (src/rpg/seduction/service/skills.ts:125-131) already loops multi-level overflow: `while (newLevel < MAX_SKILL_LEVEL && overflowXp >= xpForLevel(newLevel))` consumes every threshold and persists level/xp/xp_to_next (:135-144). The single-level limitation the ticket describes no longer exists.
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-xp-leveling

**Summary:**

When xpAmount exceeds multiple level thresholds, awardXp (src/rpg/seduction/service/skills.ts:92-134) only increments level by 1. The overflow XP may still exceed the next threshold but the excess is silently lost. Evidence: skills.ts:114-128 — const newLevel = Math.min(MAX_SKILL_LEVEL, skill.level + 1); const overflowXp = newXp - skill.xpToNext. No loop to handle multi-level gains. Impact: Large XP awards grant only one level instead of several, slowing progression. Fix: Loop while (newXp >= xpForLevel(newLevel) && newLevel < MAX_SKILL_LEVEL) to consume all thresholds.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): awardXp (src/rpg/seduction/service/skills.ts:125-131) already loops multi-level overflow: `while (newLevel < MAX_SKILL_LEVEL && overflowXp >= xpForLevel(newLevel))` consumes every threshold and persists level/xp/xp_to_next (:135-144). The single-level limitation the ticket describes no longer exists.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 0a1aa03 (registry tip: 848750e75 Konstantin Fedotov Close issue)
