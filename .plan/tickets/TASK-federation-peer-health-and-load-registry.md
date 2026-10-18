<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation peer health and load registry

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-registry-workload-columns
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Track per-peer health, circuit state, in-flight load and observed latency so
the router has something to rank on.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §2 ranking and §3 routing
read three signals: is the peer healthy, how much concurrency headroom does it
have, and what latency has it shown. None exist for peers today.

What exists and is the model:

- `src/admin/provider-health.ts:28` — an in-memory `state.cache` refreshed by
  a scan, read back by the UI at `:125`. Same shape, keyed by peer origin.

- `src/generation/providers/circuit-breaker.ts:44` — the `closed`/`open`/
  `half-open` state machine with `allowRequest` / `onSuccess` / `onFailure` /
  `getState`. A **second instance per peer**, not a reuse: tripping a vendor's
  circuit from a peer failure is precisely the conflation the epic forbids.

- `src/federation/coordinator.ts:169` `runResyncPass` — the cron-driven sweep
  that already re-fetches advertisements; health refresh rides it.

Latency is an EWMA per `(peer, workloadClass)`, updated on every completed
attempt. State is in-memory: like the provider-health cache it is lost on
restart, which is acceptable because every signal is re-derivable from the
next completed attempt.

## Acceptance Criteria

**Behaviour**

- `recordPeerOutcome(origin, class, { ok, latencyMs })` updates the EWMA and
  drives the per-peer circuit.

- `peerLoad(origin, class)` returns in-flight count and the configured
  concurrency limit so the router can rank on headroom.

- A peer that fails health refresh goes circuit-open and is excluded from
  selection until half-open succeeds.

**Tests**

- `src/federation/peer-health.test.ts` — EWMA converges toward a repeated
  latency; circuit opens after the configured failure count and recovers
  through half-open; load counters return to zero after every outcome path,
  including a thrown handler.

**Edge cases**

- `recordOutcome` for an unknown origin is a no-op with a warning, never a
  throw inside the generation path.

- A first-ever sample does not divide by zero (EWMA seeded from the sample).
- State is keyed by `(origin, class)` — a peer's image latency never moves its
  chat latency.

**Concurrency / TOCTOU**

- In-flight decrement happens in a `finally`, so a throwing handler cannot
  leak a slot; a leaked slot would permanently shrink the peer's apparent
  headroom.

- Increment-then-admit is ordered so two concurrent requests cannot both read
  a below-limit in-flight count and both admit.

**Security**

- Health state carries no user identifiers and is not reachable from any
  non-admin route.

**Regressions**

- `src/admin/provider-health.test.ts` and
  `src/generation/providers/registry.test.ts` unaffected — this adds an
  instance, it does not change the provider circuit.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-peer-registry-workload-columns`.

## Out of Scope

- Persisting health across restarts.
- Autoscaling reactions to load (owned by
  `epic-multi-instance-reconciliation.md`).

**Context:** Routing ranks on health, concurrency headroom and observed latency, and none of the three exist for peers. Provider health (`src/admin/provider-health.ts:28`) and the circuit breaker (`src/generation/providers/circuit-breaker.ts:44`) are the models — a second circuit instance per peer, not a reuse.
**Acceptance Criteria:** Outcomes update the per-`(peer, class)` latency EWMA and circuit; load returns in-flight vs limit; a circuit-open peer is excluded then recovers through half-open; counters return to zero on every path including a throwing handler.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
