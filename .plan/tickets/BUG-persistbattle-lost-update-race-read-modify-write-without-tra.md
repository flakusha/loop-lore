<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: persistBattle lost-update race (read-modify-write without transaction)

**Status:** Not Started
**Priority:** critical
**Effort:** Medium

**Summary:**

Every battle action (src/rpg/service/battles/persistence.ts:92-126) calls requireActiveBattle (read), modifies the roster in memory, then calls persistBattle (full-row write). Two concurrent actions on the same battle read the same roster; the second write silently overwrites the first. Evidence: actions.ts:33 reads battle, actions.ts:80-88 writes back full roster. No transaction or optimistic-concurrency check in persistBattle. Impact: Concurrent attacks/heals in the same battle lose one combatant's update. HP, turn state, and log entries can be silently dropped. Fix: Wrap read-modify-write in a transaction, or add AND status = 'active' to persistBattle's WHERE clause and check numUpdatedRows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
