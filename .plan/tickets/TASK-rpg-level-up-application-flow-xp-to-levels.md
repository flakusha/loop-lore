<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: level-up application flow (XP to levels)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-progression.md

## Summary

Gap G6 (verified 2026-09-08): hpOnLevelUp/grantsAsi/asiRemaining (xp/levelup.ts) and canLevelUp/levelFromXp have ZERO callers outside src/rpg/xp; no applyLevelUp; XP never becomes levels. Add applyLevelUp(actorId): sheet load -> while canLevelUp: level+1, hp+=hpOnLevelUp, ASI flag at 4/8/12/16/19, cap 20 -> persist via updateCharacterStats + ledger event. Auto-check at end of awardXp + POST /api/rpg/xp/levelup + /levelup command (gated). Plan doc batch 2 #6. Epic: epic-rpg-progression.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
