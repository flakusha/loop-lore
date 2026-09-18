<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party Economy Shared Loot And Currency Split

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, economy, loot

**Summary:**
Party-level economy: shared currency pool, shared loot pool, and per-member owed ledger for split-loot customs.

**Context:**
A caravan or raiding party needs shared coin and shared drops. The split rule is configurable (equal / shares / leader-take-all).

**Acceptance Criteria:**
- `PartyEconomy` with `sharedCurrency`, `poolItems: ItemInstanceId[]`, `perMemberOwed: Record<actorId, number>`.
- Schema additions: `party_economy_ledger(party_id, actor_id, delta_currency, reason, created_at)`.
- Loot routing on monster kill (bestiary) lands in pool first then applies split rule.
- Tests: equal split math; leader exception; partial-member join mid-trip.
