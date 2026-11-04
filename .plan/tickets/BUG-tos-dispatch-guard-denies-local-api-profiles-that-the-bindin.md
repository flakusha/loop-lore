<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: ToS dispatch guard denies local/api profiles that the binding policy says stay ungated

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The guard denies every profile lacking the ack (`src/integrations/harness/profile-selector.ts:142-150`) while the landed matrix distinguishes subscription-backed from local/api (`src/integrations/harness/provider-tos.ts:56-77`) and the Done ticket's binding frame says local/api "are NOT limited by ToS... must remain ungated" (`.plan/tickets/TASK-harness-tos-acknowledgement-dispatch-guard.md:16-18`, ACs `:28-29` marked done). The interim blanket rationale (`profile-selector.ts:12-18`) is stale now that the matrix landed (review G2 `:183`, rec 2 `:233`).

Fix: consult `providerTosInfo(p.harness).subscriptionBacked` and gate only subscription-backed flavors.

AC:

- local/api profiles select with no ack flag
- subscription-backed profiles still require it
- `tos_unacknowledged` skip code + structured log unchanged for gated flavors
- existing selector tests updated not weakened

Dependencies: after the admin-settings effective-view BUG (shares the effective-view read).

Owner-confirmed required 2026-11-03 (ratifies review OQ1: narrow the guard to subscription-backed profiles).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
