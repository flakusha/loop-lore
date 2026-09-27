<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Effect v4 retry/Schedule parity spike on the provider call path

**Summary:** Measure whether `Effect.retry` + `Schedule` collapses loop-lore's four hand-rolled retry/backoff sites into one without changing behaviour.
**Context:** Epic epic-effect-v4-adoption-evaluation. A circuit breaker is not a retry policy — `Schedule` has no breaker, which caps the achievable verdict at ADOPT-SUBSET unless the breaker proves redundant.
**Acceptance Criteria:** See ## Acceptance Criteria below — parity demonstrated on the failure path, LOC/latency measured, explicit breaker answer, one of ADOPT/ADOPT-SUBSET/REJECT written, no `src/` change.


**Status:** Done
**Status Note:** ADOPT (2026-09-27, worktree effect-adoption-dedup) — parity measured on attempt count, delay sequence, retryability filter and error identity; three byte-identical provider loops collapsed into `src/generation/providers/retry.ts`. The circuit breaker is NOT redundant and stays: v4 ships no breaker/limit operator at all, and `callWithFailover` also does cross-provider failover plus cancellation remapping that `Schedule` cannot express.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation
**Tags:** effect, evaluation, spike, retry, scheduling

## Summary

Spike S2. Effect's retry story is the one pillar where loop-lore is provably
Spike S2. Effect's retry story is the one pillar where loop-lore is provably
paying for duplication: there are **seven** exponential-backoff
implementations, and three of them are byte-identical copies of the same line.
Measure whether `Effect.retry` + `Schedule` collapses the server-side ones into
one, without changing behaviour.

## The duplication under test

**Four server-side retry loops** — the real target:

| Site | Expression |
| ---- | ---------- |
| `src/generation/providers/anthropic/http.ts:133` | `Math.min(1000 * 2 ** attempt, 10_000,)` |
| `src/generation/providers/ollama-native/http.ts:180` | `Math.min(1000 * 2 ** attempt, 10_000,)` — byte-identical |
| `src/generation/providers/openai-compatible/http.ts:206` | `Math.min(1000 * 2 ** attempt, 10_000,)` — byte-identical |
| `src/utils/safe-fetch/retry.ts:42` | `Math.min(baseDelay * 2 ** attempt, 10_000,)` — same shape, configurable base |

**Three sites that are NOT retry policies** — out of scope, do not "fix" them
as part of this spike:

| Site | What it actually is |
| ---- | ------------------- |
| `src/generation/providers/circuit-breaker.ts:134` | breaker cooldown: `baseCooldownMs * Math.pow(2, failures - threshold)` |
| `src/chat/proactive/timing.ts:59` | message-cadence scheduler: `baseMs * 2^count` |
| `src/frontend/alpine/tunnel-protocol.ts:43` | browser reconnect backoff — different runtime, cannot share a server helper |

Also adjacent but not a duplicate: `src/generation/providers/call-with-failover.ts`
performs *failover between providers*, not backoff math.

Note up front: a **circuit breaker is not a retry policy.** Effect's `Schedule`
covers backoff, jitter, and retry limits; a probe of the v4 RC's top-level
exports found nothing matching /breaker|circuit/. So `circuit-breaker.ts`
survives this spike regardless, which caps the achievable verdict at
`ADOPT-SUBSET` unless the breaker proves redundant.

## Method

1. Take **one** real provider call path (the anthropic HTTP path is the best
   candidate — it already owns backoff).
2. Build the `Effect.retry` + `Schedule.exponential` equivalent beside it in
   `.tmp/`, against the same fake transport.
3. **Use `Effect.runPromise`, not `Effect.runSync`.** Probed: `runSync` over a
   *delayed* schedule (`Schedule.exponential`) throws `AsyncFiberError`. The
   delay-free `Schedule.recurs` form that the v4 docs use in their own `runSync`
   examples works fine — so a harness written from the docs alone will pass
   while the real backoff shape is untested. This is a trap; do not fall in it.
4. Measure: net LOC delta; wall-clock latency on the happy path; and parity on
   the failure path — same attempt count, same backoff curve, same jitter
   envelope, same error surfaced to the caller.
5. Record the numbers in the epic's *Spike Results* table.

## Acceptance Criteria

- [ ] The same failure sequence produces the same attempt count, backoff curve, and caller-visible error in both implementations (parity is demonstrated, not asserted)
- [ ] Net LOC delta and happy-path latency are measured and written into the epic's *Spike Results* row S2
- [ ] An explicit answer is recorded for the circuit-breaker question: does `Schedule` replace it, and if not, what does that do to the verdict
- [ ] A written verdict of `ADOPT` / `ADOPT-SUBSET` / `REJECT` is recorded, naming the cheaper alternative if `REJECT`
- [ ] No `src/` file is modified — this is a measurement ticket

## Files

- `.tmp/effect-retry-spike/` — scratch harness (git-ignored, delete before merge)
- `.plan/epics/epic-effect-v4-adoption-evaluation.md` — *Spike Results* row S2

## Dependencies

- Blocked by: `TASK-effect-v4-bun-esm-typecheck-compatibility-spike` (hard gate)
- Reads: `src/generation/providers/circuit-breaker.ts`, `src/generation/providers/call-with-failover.ts`, `src/generation/providers/anthropic/http.ts`, `src/chat/proactive/timing.ts`
