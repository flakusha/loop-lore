<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: NPC Trade Inventory And Loot Service

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-stealth-crime
**Tags:** trade, loot, npc

**Summary:**
NPC trade endpoints and inventory service: NPCs hold tradable items, can trade with players, and dispatch loot on death.

**Context:**
NPC inventory currently is read-only (bestiary loot hooks read NPC data but no service routes the inventory). This ticket authors a full per-NPC inventory + trade lifecycle: open trade, haggling, accept/cancel, finalize, audit trail.

**Acceptance Criteria:**
- `src/services/trade-core` extended with `npc_offer` flow: NPC posts offer, player accepts/counters, the offer becomes a `trade_record` row.
- Item transfer reuses `inventory` service; both sides atomic with audit row.
- Loot dispatch on death: `awardLoot(killerActorId, npcId)` decrements NPC inventory and writes to `actor_inventory` rows.
- Tests: haggle offer exchange; trade finalize; loot prevents double-decrement.
