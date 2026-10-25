<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: useBattleItem consumes inventory and persists battle outside one transaction

**Status:** Done
**Priority:** Critical
**Resolved:** LIVE confirmed on tip — repro (trigger RAISE(ABORT) on the battles UPDATE; inventory stayed consumed at quantity 1) failed pre-fix; consumeInventoryUnit + persistBattle now wrapped in one deps.database.transaction() with trx threaded via { ...deps, database: trx } (src/rpg/service/battles/items.ts:202-216); consumption rolls back on persist failure. 14/14 battles-actions tests green, gates green 2026-10-25, branch fix/bug-sweep.
**Effort:** Medium
**Epic:** epic-inventory

**Summary:**

useBattleItem performs two independent writes: consumeInventoryUnit (which itself uses a correct conditional WHERE quantity = :current delete/update and throws on concurrent modification) and then persistBattle with the restored HP. There is no shared transaction, so a crash or throw between them leaves the item consumed with no HP restored, or HP restored with the item still in inventory.

Evidence read on dev:

- src/rpg/service/battles/items.ts:192 — const remaining = await consumeInventoryUnit(deps, item.id, item.quantity);
- src/rpg/service/battles/items.ts:202-210 — await persistBattle(deps, battle.id, battle.round, battle.turnIndex, updated, [...battle.log, action], BattleStatus.Active);

Neither write is passed a trx, and the surrounding function opens none.

Source: .tmp/longcat/review-consolidated.md nit 16; .tmp/cat-jam/review-generation-rpg-db.md P1-2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue d469731 (registry tip: 44a375b83 Konstantin Fedotov Close issue)
