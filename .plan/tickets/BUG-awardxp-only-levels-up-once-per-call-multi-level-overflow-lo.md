<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: awardXp only levels up once per call (multi-level overflow lost)

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

When xpAmount exceeds multiple level thresholds, awardXp (src/rpg/seduction/service/skills.ts:92-134) only increments level by 1. The overflow XP may still exceed the next threshold but the excess is silently lost. Evidence: skills.ts:114-128 — const newLevel = Math.min(MAX_SKILL_LEVEL, skill.level + 1); const overflowXp = newXp - skill.xpToNext. No loop to handle multi-level gains. Impact: Large XP awards grant only one level instead of several, slowing progression. Fix: Loop while (newXp >= xpForLevel(newLevel) && newLevel < MAX_SKILL_LEVEL) to consume all thresholds.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
