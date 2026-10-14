<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Plugin and tool-runtime residual defects

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Six verified defects in the plugin host and its supporting services.

- src/plugins/quality-metrics.ts:199-206 — an unknown AgencyDimension value is dropped with a bare continue, no log and no metric. If a migration adds an enum value before the TypeScript enum is updated, every row for that dimension is silently discarded.
- src/services/actor-items/transfer.ts:84-90 — the stackability lookup matches on name and item_type only, so two items with the same name and type but different weight or value merge onto one row.
- src/plugins/tool-executor.ts:38-47 — the timeout rejects the returned promise but the handler keeps running; ToolExecutionContext (types.ts:93-97) carries no signal, so a timed-out tool holds its DB connections and file handles until it finishes on its own.
- src/plugins/event-bus.ts:35-43 — emitPluginEvent awaits each handler in registration order with no per-handler timeout, so one slow handler delays every later subscriber.
- src/services/trade/counter.ts:149-156 — listOffers issues UPDATE crafting_orders SET status = 'expired' before its SELECT, a write inside a function callers expect to be a read.
- src/plugins/lifecycle.ts:23 — stop awaits a fixed 500ms setTimeout per instance, and stopAll at :45-47 awaits them sequentially; three instances block the event loop for 1.5s.

No action needed: src/services/trade/balance.ts:167 transferCurrency returning true for amount <= 0 is deliberate and covered by balance.test.ts; createOffer's lack of service-level validation is covered by the route schema (routes/trade/offers.ts:52) and no non-route caller exists.

Source: .tmp/longcat/review-plugins-services.md M1-M5, L1, L2, L3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
