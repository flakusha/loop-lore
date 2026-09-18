<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party Free Jump Location Graph Edge

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, travel, fast-travel

**Summary:**
Allow parties to use a free-travel (jump) edge that ignores adjacency but consumes a per-use resource (gold, item, cooldown, or GM permission).

**Context:**
Players want fast intra-location travel (caravan from one city to another via portal). Free-jump is an edge mode distinct from adjacency and fast-travel - it can be a portal, a teleport spell, a faction-friendly gate, or a paid ferry.

**Acceptance Criteria:**
- `LocationEdge` mode extended with `"free-jump"` carrying `cost: { gold?, itemId?, cooldownHours?, requiresFactionStanding? }`.
- Party travel engine consults the cost: `cost.gold` is deducted from `PartyEconomy.sharedCurrency`; `cost.cooldownHours` enforces a per-party throttle on the same edge.
- GM mode (admin override) bypasses cost.
- Discovery gating reuses `TASK-location-graph-editor-and-discovery-gating`.
- Tests: successful jump deducts gold; insufficient gold rejected; cooldown enforced.
