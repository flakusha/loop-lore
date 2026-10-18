<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation offload two-instance e2e

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-dispatch-compose-failover, TASK-federation-performance-quota-enforcement, TASK-federation-admin-usage-dashboard-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Prove the epic end to end across two real loop-lore instances, and prove that
federation off leaves every workload path untouched.

## Context

`.plan/epics/epic-federation-offload-quotas.md` testing strategy. This is the
ticket that holds the whole epic to its claims rather than each slice to its
own.

Two real servers over real route handlers, in the style of
`src/routes/federation-transfer.test.ts` (an in-process `PeerPost` forwarding
to the second Elysia app, so every byte crosses the real handlers). A loopback
peer serves a different workload class.

Covered:

- a chat turn routed to a peer and back, with the peer persisting the result;
- a sticky session staying pinned across turns, and reassigning when the peer
  goes circuit-open;

- a hard concurrency budget returning `429` with `Retry-After` and the peer
  being excluded afterwards;

- a peer timeout aborting the peer attempt only;
- partial output discarded rather than concatenated with the local retry;
- a `429` reached through the non-streaming path, the streaming path, and the
  aux path — all three enforcement points asserted;

- an offloaded chat whose `federation_consented_at` is NULL being refused.

Federation-off parity is asserted across the whole run: with
`config.federation.enabled = false` the admin federation endpoints answer
`404` and no workload call site changes shape.

## Acceptance Criteria

**Behaviour**

- The scenario above runs green as one suite over two booted instances.
- With federation disabled, the same chat turn produces the same persisted
  result as the federation-off control run.

**Tests**

- `tests/e2e/` federation offload spec, run under `E2E_SAFEGUARD=1`.
- A unit-level parity assertion that `scheduledCallWithFailover`
  (`src/generation/scheduler.ts:75`) is invoked identically with routing on and
  off for a local-resolved request.

**Edge cases**

- The second instance is stopped mid-test: the turn completes on the local
  path and the message is marked failed rather than served half-written.

- Two concurrent turns from the same chat during a peer outage both complete
  locally and both record the fallback.

**Concurrency / TOCTOU**

- The sticky assignment is not leaked between the two instances' test
  databases — each test gets its own DB, asserted by the existing
  per-test-DB convention.

**Security**

- The full security set from the epic is asserted here as the acceptance
  gate, not only in unit tests: workload trust independent of content trust;
  loopback peers cannot be unauthenticated; cross-chat data minimization; the
  consent gate; the no-leak assertion on the peer-visible body.

**Regressions**

- `bun test src/` and `bun run check` green.

**Repo gates**

- `bun run check` green; the e2e suite passes under `E2E_SAFEGUARD=1`.

## Dependencies

- `TASK-federation-peer-dispatch-compose-failover`,
  `TASK-federation-performance-quota-enforcement`,
  `TASK-federation-admin-usage-dashboard-ui`.

## Out of Scope

- Multi-host networking — two in-process instances over loopback is the
  harness, matching the existing federation transfer tests.

**Context:** The gate that holds the epic to its claims rather than each slice to its own: two real instances over real route handlers, in the style of `src/routes/federation-transfer.test.ts`, plus an explicit federation-off parity assertion.
**Acceptance Criteria:** A chat turn routes to a peer and back; a sticky session stays pinned and reassigns on circuit-open; a hard budget 429s on all three entry paths; a timeout aborts the peer attempt only; consent-less offload is refused; federation off leaves every workload path byte-identical.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
