<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation performance quota enforcement

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-workload-wire-endpoints, TASK-federation-peer-health-and-load-registry
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Bound what each peer may consume on this instance: concurrency, requests per
minute, and an advisory token rate.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §3.

A budget is three numbers per `(peer, workloadClass)`: `maxConcurrency`,
`requestsPerMinute`, `tokensPerMinute`. A budget is **unset means
unlimited**; a newly added peer is **advisory**, never hard.

**Counters live in memory in the receiving process**, keyed
`(peerOrigin, workloadClass)`. `createRateLimiter({ windowMs, maxRequests })`
(`src/middleware/rate-limit.ts:82`) is the existing sliding-window primitive
and is reused; concurrency uses the same `ConcurrencyLimiter`
(`src/llm/concurrency-limiter.ts`) the local scheduler uses, instantiated per
`(peer, class)`.

Why in-memory and not DB: the only truthful authority for "is this peer over
its concurrency budget right now" is the process holding the in-flight
requests. A DB counter would need a distributed reservation to be atomic
across instances, which is consensus — out of scope. The consequence is
stated, not hidden: **counters reset on restart**, so a restarted instance is
permissive for one window. Budgets themselves are config and survive.

`tokensPerMinute` is **advisory only** — tokens are unknown until a generation
is already paid for, so a hard token budget cannot reject before the fact.
It is reported, not enforced.

Enforcement order at `/api/peer-work/run`, before any work is admitted:

1. **Route away** — the sender's router reads advertised headroom and excludes
   the over-budget peer. Preferred, always first.

2. **Queue** — under `maxQueueDepth`, wait for a slot up to the per-attempt
   timeout.

3. **Reject** — only when there is nowhere else: `429` with `Retry-After` and
   `error_code` `federation.quota_exceeded`. A `429` peer is excluded from
   selection for `Retry-After` seconds, exactly like a circuit-open peer.

## Acceptance Criteria

**Behaviour**

- A peer at `maxConcurrency` with queue depth available waits and then runs;
  past `maxQueueDepth` it gets `429` with a `Retry-After` header.

- A peer over `requestsPerMinute` gets `429` on the next request and is
  excluded for the window.

- `tokensPerMinute` is reported in the usage snapshot and never rejects.
- An advisory budget that is exceeded still runs the work.

**Tests**

- `src/federation/performance-quota.test.ts` against an **injected clock**,
  never `Date.now()` — window rollover, concurrency admission and release,
  queue-depth boundary, advisory-vs-hard for each of the three budgets.

- A `429` is asserted to exclude the peer for the advertised `Retry-After`
  and re-admit after it.

**Edge cases**

- An unknown origin or class is treated as over-budget (fail closed), not
  unlimited.

- A limiter for a peer that goes idle is pruned; the map does not grow without
  bound across churn.

- A `429` on a peer with no configured budget is impossible — unset is
  unlimited.

**Concurrency / TOCTOU**

- In-flight increment happens before admission and decrement in a `finally`,
  so two concurrent requests cannot both read a below-limit count and both
  admit, and a throwing handler cannot leak a slot.

**Security**

- Enforcement is per receiving process; no cross-instance read-modify-write
  window exists, so a `429` is authoritative the moment it is returned.

- Quota rejections write a `log_entries` row at `warn` naming the peer, the
  class, and the limit hit — a peer hammering a budget is the signal an
  operator needs.

**Regressions**

- `src/middleware/rate-limit.test.ts` green — the limiter is reused, not
  modified.

- `src/llm/resource-manager.test.ts` green — local scheduling is untouched.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-peer-workload-wire-endpoints` (the single enforcement
  point),
  `TASK-federation-peer-health-and-load-registry` (headroom signal).

## Out of Scope

- Durable cross-restart counters.
- Billing or metering (`epic-generation-flow-control.md`).

**Context:** Bounds what each peer consumes here: `maxConcurrency`, `requestsPerMinute`, advisory `tokensPerMinute`. Counters are in-process per `(peer, class)`, reusing `createRateLimiter` and `ConcurrencyLimiter`; a DB counter would need a distributed reservation, which is consensus and out of scope.
**Acceptance Criteria:** Concurrency queues then runs, past queue depth returns 429 with `Retry-After` and excludes the peer for that window; advisory budgets never reject; token budgets report only; in-flight slots release on the error and abort paths; the limiter is reused, not modified.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
