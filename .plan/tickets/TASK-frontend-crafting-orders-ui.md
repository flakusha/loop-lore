<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Crafting Orders UI

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-crafting-professions
**Related:** TASK-wire-crafting-routes, TASK-trade-history-npc-counterparty
**Source:** FE-BE harmonization check, 2026-09-17 — 5 routes in this slice.

## Summary

Wire the crafting-order lifecycle UI (list / create / accept / fulfill / cancel).
Backend endpoints are complete; web UI has no caller.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/worlds/:worldId/crafting-orders` | `src/routes/crafting/orders.ts:103` |
| POST | `/api/worlds/:worldId/crafting-orders` | `src/routes/crafting/orders.ts:60` |
| POST | `/api/worlds/:worldId/crafting-orders/:orderId/accept` | `src/routes/crafting/orders.ts:123` |
| POST | `/api/worlds/:worldId/crafting-orders/:orderId/fulfill` | `src/routes/crafting/orders.ts:148` |
| POST | `/api/worlds/:worldId/crafting-orders/:orderId/cancel` | `src/routes/crafting/orders.ts:162` |

## Acceptance Criteria

- [ ] Orders list view (open + closed) on world dashboard
- [ ] Create-order form
- [ ] Accept/fulfill/cancel actions with confirm prompts
- [ ] Owner-only actions gated by auth + role check
- [ ] `bun run check` green
