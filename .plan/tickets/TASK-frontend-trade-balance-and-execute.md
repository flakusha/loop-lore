<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Trade Balance + Execute

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** 2026-11-09 reconcile: slice built in this lane — balance lookup on panel open (`loadBalance` in `src/frontend/alpine/inventory-trading.ts`, GET `/api/worlds/:worldId/trade/balance`), atomic settle (`executeTrade`, POST `/trade/execute` with both sides' lines + net price), result/error rendering, balance invalidation on success; colocated tests (`inventory-trading.test.ts`: balance load, execute payload, failure keeps draft, empty-draft no-op) + `status.tradeBalanceFailed` locale key. Backend routes + tests pre-existing (`src/routes/trade/index.ts:64,89`).
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-economy-trading
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Related:** TASK-trade-history-npc-counterparty, TASK-persistent-trade-offer-accept-cancel-lifecycle-with-counter-
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes in this slice.

## Summary

Wire the trade balance lookup and trade execution endpoint. The web UI has no
caller for either. Companion offers/history endpoints (TRADE offer routes) are
flagged as INFRA-style endpoints and are out of scope for this slice.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/worlds/:worldId/trade/balance` | `src/routes/trade/index.ts:45` |
| POST | `/api/worlds/:worldId/trade/execute` | `src/routes/trade/index.ts:70` |

## Acceptance Criteria

- [x] Trade panel shows current balance (GET on open)
- [x] Execute button submits the trade payload (POST)
- [x] Result rendered; balance invalidated on success
- [x] Error path shows the backend message
- [x] `bun run check` green
