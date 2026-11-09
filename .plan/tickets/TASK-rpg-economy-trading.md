<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: Economy & Trading

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** 2026-11-09 reconcile: umbrella confirm — trade currency/offer/history/NPC-buy-sell backend + NPC trade UI + balance/execute frontend all shipped (see `TASK-frontend-trade-balance-and-execute.md` Done 2026-11-09). Remainder (auction/banking/market sim) tracked under `epic-economy-trading.md` / `TASK-economy-trading.md`.
**Priority:** low
**Effort:** Large
**Epic:** epic-economy-trading
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

## Summary

Economy and trading system: currency, trading, market prices, trade routes, economic events. From Epic 22 sub-system.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
