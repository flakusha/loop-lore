<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NPC buy and sell double-record trade history

**Status:** Done
**Priority:** Medium
**Effort:** Medium

**Summary:**

tradeCore records the trade inside its own transaction, then buyFromNpc and sellToNpc record a second row after it returns success. Every NPC trade therefore writes two trade_history rows, one typed player_player and one typed player_npc, and the ledger no longer reconciles with the actual item/currency movement.

Evidence read on dev:

- src/services/trade/core.ts:119 — recordTrade with trade_type 'player_player' inside tradeCore's transaction.
- src/services/trade/npc.ts:52-61 — buyFromNpc calls recordTrade again with trade_type 'player_npc' after tradeCore resolves.
- src/services/trade/npc.ts:104-113 — sellToNpc repeats the same pattern.

No test asserts a trade_history row count for either NPC path (src/services/trade/core.test.ts:201-227 checks only success/reason), which is why this ships.

Fix: drop the outer recordTrade calls and have tradeCore accept the trade type, or make the NPC layer the sole recorder. Assert the row count in both tests.

Source: .tmp/longcat/review-plugins-services.md C1 and C2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-14 registry-driven close: git issue 2749949 (registry tip: 892130a2e Konstantin Fedotov Auto-closed: appended .md marker marks BUG-NPC-BUY-AND-SELL-DOUBLE-RECO)
