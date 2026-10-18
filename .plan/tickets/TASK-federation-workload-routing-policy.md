<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation workload routing policy

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-registry-workload-columns, TASK-federation-peer-capability-advertisement, TASK-federation-peer-health-and-load-registry
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Decide local-vs-remote for one workload, with stickiness for chat and a
universal fallback to local.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §2. This ticket ships the
**decision**, not the dispatch: a pure `resolve()` that returns
`{ target: "local" }` or `{ target: "peer", peer, assignmentKey }`. The next
ticket consumes it.

It is pure — no clock, no network, no randomness beyond one documented
round-robin cursor — so it is testable the way `ModelRouter.route()` is
(`src/generation/routing/router.ts:58`), which is the in-repo precedent for
"routing that must be reproducible".

Precedence, evaluated in order:

1. **Eligibility** — federation enabled, peer `state = trusted`,
   `workload_trust`, class in both the peer's allowed set and its
   advertisement, peer circuit not open for the class.

2. **Stickiness** — an existing assignment for `(affinityKey, class)` wins
   while the peer stays eligible. Only `chat` is sticky; `image`, `embedding`,
   `tts`, `translation`, `vision` and `aux` are stateless per request.

3. **Assignment matrix** — an operator-set ordered preference list per class
   narrows candidates. A class with no matrix row is **local-only**; this is
   how per-class federation-off is expressed.

4. **Ranking** — by in-flight concurrency headroom, then observed latency
   EWMA, then a stable origin tiebreak. Local ranks last as the universal
   fallback.

Assignments live in a `mesh_work_assignments` table keyed
`(affinity_key, workload_class)`. Releasing an assignment on circuit-open is
recorded, not silent.

## Acceptance Criteria

**Behaviour**

- `resolve({ class: "embedding" })` with no matrix row returns
  `{ target: "local" }` even when eligible peers exist.

- With a matrix row naming two eligible peers, the one with more headroom
  wins; with equal headroom, the lower latency EWMA; with both equal, the
  lexicographically smaller origin.

- Two successive `resolve` calls with identical inputs return identical order.
- A sticky `chat` resolves to the same peer across calls until that peer goes
  ineligible, at which point it reassigns and records the reassignment.

**Tests**

- `src/federation/peer-router.test.ts` — each precedence rule in isolation;
  the four-tier tiebreak chain; stickiness retained and released; local-only
  when the matrix row is absent; federation disabled forces local for every
  class.

**Edge cases**

- An unknown `workloadClass` resolves to local and logs a warning rather than
  throwing.

- A peer whose advertisement is stale (older than the refresh interval) is
  treated as not advertising anything.

- Every candidate ineligible yields local, never `undefined`.

**Concurrency / TOCTOU**

- Concurrent `resolve` calls for the same affinity key do not create two
  competing assignments: the assignment write is an upsert on
  `(affinity_key, workload_class)` and a loser re-resolves rather than
  overwriting.

**Security**

- `resolve` never returns a peer that is not `workload_trust`.
- `affinityKey` is opaque on the wire; this module only reads and writes the
  local mapping.

**Regressions**

- `src/generation/routing/router.test.ts` green — this is a separate module
  and does not touch the model router.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-peer-registry-workload-columns`,
  `TASK-federation-peer-capability-advertisement`,
  `TASK-federation-peer-health-and-load-registry`.

## Out of Scope

- Executing the chosen target (next ticket).
- Load-weighted autoscaling.

**Context:** The decision half of offload: a pure `resolve()` returning local or a peer, testable the way `ModelRouter.route()` is. Eligibility, then chat-only stickiness, then the operator's per-class assignment matrix, then headroom/latency ranking with local as the universal fallback.
**Acceptance Criteria:** An empty matrix row is local-only; the four-tier tiebreak is deterministic across identical inputs; a sticky chat stays pinned until its peer becomes ineligible, and the reassignment is recorded; no eligible candidate yields local, never `undefined`.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
