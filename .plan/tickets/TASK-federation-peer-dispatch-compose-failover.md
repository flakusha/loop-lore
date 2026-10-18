<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation peer dispatch compose failover

**Status:** Not Started
**Priority:** critical
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-workload-routing-policy, TASK-federation-peer-workload-wire-endpoints
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Compose peer routing with provider failover at every generation call site,
without conflating the two.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §2, "Queue/dispatch seam".

The rule: **a peer is never registered as an `LLMProvider`.**
`callWithFailover(providers, req, handler?)`
(`src/generation/providers/call-with-failover.ts:35`) picks among local
providers registered in `registry.ts`, gated by the local
`circuitBreaker.allowRequest` (`:80`), with its chain from `buildFailoverList`
(`src/generation/providers/registry.ts:189`). Registering a peer there would
trip a *vendor's* circuit from a peer failure, offer a peer as a fallback for
a chat whose sticky assignment says otherwise, and silently add a remote
candidate to the aux pipeline's deliberately single-element list
(`src/aux-pipeline/runner.ts:184`).

Instead, routing resolves **before** the scheduler is entered. Each hop owns
exactly one failover decision; the receiving peer resolves its own local
provider chain.

Call sites that change shape:

| Call site | Change |
| --- | --- |
| `src/generation/generate-route/handler.ts:135` | resolve first; sticky; peer attempt then one local retry |
| `src/aux-pipeline/runner.ts:184` | resolve first; `null` on peer failure; attempt timeout clamped to the 2s budget |
| `src/generation/auto-gen/call-llm.ts:187,236` | resolve first; same retry-once |
| image / TTS / embedding / translation / vision sites | resolve first; stateless, no stickiness |
| `src/generation/scheduler.ts:75` | **unchanged** — stays the local-only executor |

Retry semantics: exactly one retry, only across the local/remote boundary. Two
remote attempts are never made; a local failure never goes remote.

## Acceptance Criteria

**Behaviour**

- With federation disabled or no matrix row, every listed call site produces
  byte-identical behaviour to today: the router resolves local and the local
  path runs unchanged.

- A peer attempt that fails mid-flight is retried once on the local path, and
  the failed attempt is closed with `CancelSource.System` /
  `CancelReason.Error` (`src/db/enums-generation.ts:43`) while the retry gets
  a new `generation_attempts` row.

- A local failure never issues a peer attempt.
- Aux-pipeline peer failure returns `null` (`src/aux-pipeline/runner.ts:190`),
  preserving graceful degradation.

**Tests**

- `src/federation/peer-dispatch.test.ts` — routing-off parity, one-remote-one-
  local retry, no second remote attempt, aux `null` contract.

- Streaming case: partial output from a failed peer attempt is **discarded**,
  not concatenated with the local retry, and the client is told the attempt
  failed rather than being served a visibly rewritten reply.

**Edge cases**

- Peer timeout aborts the peer attempt only and does not consume the caller's
  remaining budget.

- An abort mid-peer-attempt propagates through `AbortController` and lands as
  `GenerationCancelledError` with the original reason and source, not as a
  generic error.

- A peer that has already been retried locally once is not retried again on
  the same request.

**Concurrency / TOCTOU**

- The sticky assignment is read before dispatch and re-read after a peer
  failure, so a concurrent reassignment cannot resurrect a released peer
  mid-request.

**Security**

- No peer-visible payload carries a chat id, user id, session cookie, or any
  other chat's content.

- Offloaded chat context requires `chats.federation_consented_at`; the
  clearance gate default-denies while it is NULL.

**Regressions**

- `src/generation/providers/registry.test.ts`,
  `src/generation/generate-route/non-stream.test.ts`,
  `src/aux-pipeline/aux-pipeline.test.ts` green.

- `buildFailoverList` output contains no peer under any configuration — asserted
  explicitly, since that is the failure this design exists to prevent.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-workload-routing-policy`,
  `TASK-federation-peer-workload-wire-endpoints`.

## Out of Scope

- Cross-instance queue persistence (`epic-llm-request-scheduler.md`).
- Provider billing or metering.

**Context:** Wires the router into every call site that already funnels through `scheduledCallWithFailover`, keeping peer routing a pre-step outside the provider registry. A peer is never an `LLMProvider`, so a peer failure can never trip a vendor's circuit breaker.
**Acceptance Criteria:** With routing off every call site behaves exactly as today; a failed peer attempt retries once locally and nothing ever makes two remote attempts; partial output is discarded rather than concatenated; `buildFailoverList` contains no peer under any configuration.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
