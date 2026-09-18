<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Trade Balance + Execute

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-economy-trading
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

- [ ] Trade panel shows current balance (GET on open)
- [ ] Execute button submits the trade payload (POST)
- [ ] Result rendered; balance invalidated on success
- [ ] Error path shows the backend message
- [ ] `bun run check` green
