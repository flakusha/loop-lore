<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: persistBattle lost-update race (read-modify-write without transaction)

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — persistBattle's UPDATE carries `.where("status", "=", BattleStatus.Active)` (src/rpg/service/battles/persistence.ts:125) and throws on zero affected rows (:128-130), closing the completed-battle overwrite the ticket describes (ticket's own prescribed fix form; residual active-vs-active serialization tracked by the useBattleItem transaction ticket).
**Priority:** critical
**Effort:** Medium
**Epic:** epic-battle-action-systems

**Summary:**

Every battle action (src/rpg/service/battles/persistence.ts:92-126) calls requireActiveBattle (read), modifies the roster in memory, then calls persistBattle (full-row write). Two concurrent actions on the same battle read the same roster; the second write silently overwrites the first. Evidence: actions.ts:33 reads battle, actions.ts:80-88 writes back full roster. No transaction or optimistic-concurrency check in persistBattle. Impact: Concurrent attacks/heals in the same battle lose one combatant's update. HP, turn state, and log entries can be silently dropped. Fix: Wrap read-modify-write in a transaction, or add AND status = 'active' to persistBattle's WHERE clause and check numUpdatedRows.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): persistBattle's UPDATE carries `.where("status", "=", BattleStatus.Active)` (src/rpg/service/battles/persistence.ts:125) and throws on zero affected rows (:128-130), closing the completed-battle overwrite the ticket describes (ticket's own prescribed fix form; residual active-vs-active serialization tracked by the useBattleItem transaction ticket).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue cf7fe39 (registry tip: 352ae4b96 Konstantin Fedotov Close issue)
