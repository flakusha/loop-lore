<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: endBattle overwrites completed battles (no active-status guard)

**Status:** Not Started
**Priority:** critical
**Effort:** Medium
**Epic:** epic-battle-action-systems

**Summary:**

endBattle (src/rpg/service/battles.ts:98-115) fetches the battle but never checks battle.status === BattleStatus.Active. It unconditionally overwrites status and ended_at. Evidence: battles.ts:103-112 — the only guard is if (!battle) throw. No status check. performAttack (actions.ts:80-88) sets BattleStatus.Completed when combat ends; a subsequent endBattle(deps, id, 'fled') overwrites it. Impact: A battle auto-resolved by combat can be re-ended with a different outcome, corrupting the battle record and log. Fix: Add if (battle.status !== BattleStatus.Active) throw new Error(...) after the null check.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
