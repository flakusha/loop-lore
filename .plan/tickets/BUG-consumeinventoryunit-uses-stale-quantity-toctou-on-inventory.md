<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: consumeInventoryUnit uses stale quantity (TOCTOU on inventory)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

useBattleItem (src/rpg/service/battles/items.ts:191,230-251) reads the item rows, then calls consumeInventoryUnit with the stale current value. A concurrent item use between read and write can delete a row that now has quantity > 0, or decrement to a wrong value. Impact: Inventory corruption — items can be deleted while still in stock, or quantities drift under concurrent use. Fix: Add .where('quantity', '=', current) to the UPDATE/DELETE and check affected rows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
