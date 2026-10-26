<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: consumeInventoryUnit uses stale quantity (TOCTOU on inventory)

**Status:** Done
**Status Note:** resolved 2026-10-26 (branch `fix/battle-item-quantity-fresh-read`) — the earlier closure rationale was incomplete: the `.where("quantity", "=", current)` guard prevents INVENTORY CORRUPTION but converts every concurrent use into a hard failure, because `current` was the quantity seen by the PRE-transaction listing. A concurrent consumer taking one unit between that listing and the battle transaction made `useBattleItem` throw `Item ... was modified concurrently` even though stock remained. The fix re-reads the row's quantity INSIDE the transaction (`consumeInventoryUnit` now takes no `current` argument, src/rpg/service/battles/items.ts) and keeps the conditional write as the in-transaction guard; a row that vanished or emptied throws `Item ... is no longer in inventory`. Regression test: `useBattleItem consumes the stock it finds inside the transaction` in src/rpg/service/battles-actions.test.ts (deterministic interleave plugin, reproduces the failure on the pre-fix code).
**Priority:** medium
**Effort:** Medium
**Epic:** epic-inventory

**Summary:**

useBattleItem (src/rpg/service/battles/items.ts:191,230-251) reads the item rows, then calls consumeInventoryUnit with the stale current value. A concurrent item use between read and write can delete a row that now has quantity > 0, or decrement to a wrong value. Impact: Inventory corruption — items can be deleted while still in stock, or quantities drift under concurrent use. Fix: Add .where('quantity', '=', current) to the UPDATE/DELETE and check affected rows.

**Context:**

Closure rationale (superseded 2026-10-26): the guard `.where("quantity", "=", current)` existed on dev, so the ticket was closed as stale-resolved. That was incomplete — the guard is applied with the quantity observed by the PRE-transaction listing, so any concurrent consumption between listing and write matched zero rows and failed the whole battle action with `Item ... was modified concurrently` even when stock remained. The guard also cannot protect the DELETE path's semantics without a fresh read. Correct fix: read the row's quantity inside the transaction that performs the write, keep the conditional write as an in-transaction guard, and report `Item ... is no longer in inventory` when the row is gone or empty.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue aba5489 (registry tip: b95dcdaa4 Konstantin Fedotov Close issue)
