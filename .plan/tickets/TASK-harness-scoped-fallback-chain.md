<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Scoped fallback provider chain

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `epic-harness-integration`
**Depends on:** `TASK-harness-model-routing`
**Related:** docs/meta/research/harness-hook-schema-absorption.md

**Summary:**

`config.generation.routing.fallbacks` changes from a number cap to an ordered scoped list `FallbackScope[] {scope, entries[]}` — scope = taskType or `default`, explicit `[]` disables inheritance — consumed by `buildFailoverList` without touching breaker/cancellation semantics. The hermes `scoped_fallback_chain` shape, validated verbatim against `_init_fallback_chain` in the hermes-agent checkout.

**Context:**

`fallbacks?: number` (`src/generation/routing/routing-config.ts:26-27`) is a cap, not a policy; the router already emits an ordered `RouteResult {primary, fallbacks}` (`router.ts:38-42`) that config cannot express per-scope. Absent config must reproduce today's provider-order output byte-for-byte.

**Acceptance Criteria:**

- [ ] `fallbacks` becomes `FallbackScope[]`; `[]` disables inheritance for that scope; absent = today's behavior
- [ ] `buildFailoverList` (registry.ts:181-209) consumes the scoped list; circuit breaker + cancellation in `call-with-failover.ts:29-67` unchanged
- [ ] Unit tests: order honored, scope override wins, `[]` disables, unconfigured scope byte-for-byte equals today
- [ ] `bun run check` green

## Technical Notes

- Feeding the scoped list through `buildFailoverList` is a config-shape change, not a new resolver — but it stays unverified until the ticket lands.
