<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Backend worker subdivision: pure buffer/vector transforms off main thread, Kysely stays main

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Research note 10-bun-workers-subdivision: no backend Worker/Bun.spawn in src by documented decision (sandbox.ts: Kysely handle cannot cross Worker boundary, no ResourceLimits on Bun). Main keeps server + Kysely + spill paths; workers get pure bytes-in/bytes-out (embedding dot-products, image/audio buffer transforms) with main fetching rows first and persisting after. Pool with unref, smol:true for small inputs, cgroup only for heavy sidecars (not per-request). Do not move DB into workers. Source: .tmp/research/ai-cheat/10-bun-workers-subdivision.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
