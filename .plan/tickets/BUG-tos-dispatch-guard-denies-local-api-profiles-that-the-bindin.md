<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: ToS dispatch guard denies local/api profiles that the binding policy says stay ungated

**Status:** Done
**Status Note:** Implemented on branch `harness-effective-view` (stacked on `acp-composition-root` @ `9c5c95116`); pending finalize behind the parked wave.
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

The blanket ack guard contradicted the dispatch-guard ticket's binding policy frame once
the provider matrix landed. The selector now consults a new fail-closed
`providerTosGated()` (`provider-tos.ts`: unknown flavor ⇒ GATED, never auto-allowed) and
gates only subscription-backed flavors; local/api profiles select without an ack. The
`tos_unacknowledged` skip code and the structured log line are preserved verbatim for
gated flavors; the stale blanket rationale comment in `profile-selector.ts` is removed.
Existing selector tests updated (not weakened): the blanket-denial cases now pin
codex/claude-code as gated, plus new negative-path tests (local ungated, unknown flavor
denied) in `profile-selector.test.ts` and `provider-tos.test.ts`.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
