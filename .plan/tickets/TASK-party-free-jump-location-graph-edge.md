<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Party Free Jump Location Graph Edge

**Status:** In Progress
**Status Note:** 2026-11-10 (release-010-closeout): the edge mode shipped — `free-jump` is a first-class `LocationEdgeMode` (`src/db/enums-story/world.ts`) carrying a validated `cost_json` price tag (gold, itemId, cooldownHours, requiresFactionStanding — `src/locations/edge-core.ts`), the cooldown runs off the append-only world event log (`src/locations/edge-discovery.ts`), the gold is charged from the travelling actor's wallet and the faction-standing gate is enforced in `src/locations/edge-travel.ts`, and discovery gating reuses the edge discovery service. Tests cover a charged jump, a refused jump (insufficient gold) and the cooldown window. Still open: the party-level cost split (the ticket names `PartyEconomy.sharedCurrency`; the implementation charges the acting actor) and a GM cost bypass (the admin override bypasses discovery only).
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
