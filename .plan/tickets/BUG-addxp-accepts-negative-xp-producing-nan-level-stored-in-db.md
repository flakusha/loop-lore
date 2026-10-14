<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: addXp accepts negative XP producing NaN level stored in DB

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

addXp (src/rpg/skills/service/progression.ts:19-41) does not validate xpAmount. A negative value reduces skill.xp; calculateLevel(negative) returns NaN (Math.sqrt(negative/50)), which is written to the level column. Evidence: progression.ts:25-27 — const newXp = skill.xp + xpAmount; const newLevel = calculateLevel(newXp). helpers.ts:35-38 — calculateLevel does Math.floor(Math.sqrt(xp / 50)) + 1. Math.sqrt(-10) = NaN. Impact: A single negative-XP call corrupts the skill row (level = NaN, broken progression). Fix: Add if (xpAmount < 0) throw new Error('xpAmount must be non-negative') at the top of addXp.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
