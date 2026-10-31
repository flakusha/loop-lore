<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Trading Interface

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Task
**Tags:** inventory, frontend, ui, trading
**Epic:** epic-inventory-ui

## Summary

Trading interface for NPC transactions.

## Core Features

- NPC inventory display
- Player inventory display
- Item selection
- Trade confirmation

## Acceptance Criteria

- [ ] NPC inventory display
- [ ] Player inventory display
- [ ] Item selection for trade
- [ ] Trade value calculation
- [ ] Trade confirmation
- [ ] Mobile responsive

## Files to Create

- `src/frontend/inventory/trading-interface.ts`
- `src/frontend/inventory/trade-panel.ts`

## Resolution (2026-10-30)

NPC leg shipped as `src/frontend/inventory/trade-panel.ts` (pure trade logic) plus
the `src/frontend/alpine/inventory-trading.ts` Alpine scope (commit
`3671f2fb5`, plus the `world_items`-space fix `26f5da876`).

P2P leg shipped as `src/frontend/inventory/trade-offers.ts` (predicates/types)
plus the `src/frontend/alpine/inventory-offers.ts` Alpine scope and the
`src/components/trade-window-panel.html` partial (commit `4644e0de0`, plus the
counter-terms guard `a08c4e813` and the cleared-price guard `5fbe43e23`).

The standalone `src/frontend/inventory/trading-interface.ts` DOM renderer was
pruned as dead in `1e5d648f3` — the live path is Alpine-templated partials.

**Resolved:** 2026-10-30 shipped: NPC trading (`3671f2fb5`) and P2P trading (`4644e0de0`) on dev; standalone `trading-interface.ts` DOM renderer pruned as dead (`1e5d648f3`).
