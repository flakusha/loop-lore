<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add TradeType enum for trade_history.trade_type

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-economy-trading

## Summary

Replace string-typed trade_type in trade_history with TradeType enum (player_player, player_npc, npc_npc, crafting). The 065_trade_history.ts migration defaults to 'player_player' and 'crafting'. Must create src/db/enums-core/trade-type.ts with enum, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
