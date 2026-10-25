<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: consumeInventoryUnit uses stale quantity (TOCTOU on inventory)

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-inventory

**Summary:**

useBattleItem (src/rpg/service/battles/items.ts:191,230-251) reads the item rows, then calls consumeInventoryUnit with the stale current value. A concurrent item use between read and write can delete a row that now has quantity > 0, or decrement to a wrong value. Impact: Inventory corruption — items can be deleted while still in stock, or quantities drift under concurrent use. Fix: Add .where('quantity', '=', current) to the UPDATE/DELETE and check affected rows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue aba5489 (registry tip: b95dcdaa4 Konstantin Fedotov Close issue)
