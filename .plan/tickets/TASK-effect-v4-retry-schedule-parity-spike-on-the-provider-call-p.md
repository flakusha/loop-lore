<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Effect v4 retry/Schedule parity spike on the provider call path

**Summary:** Measure whether `Effect.retry` + `Schedule` collapses loop-lore's four hand-rolled retry/backoff sites into one without changing behaviour.
**Context:** Epic epic-effect-v4-adoption-evaluation. A circuit breaker is not a retry policy — `Schedule` has no breaker, which caps the achievable verdict at ADOPT-SUBSET unless the breaker proves redundant.
**Acceptance Criteria:** See ## Acceptance Criteria below — parity demonstrated on the failure path, LOC/latency measured, explicit breaker answer, one of ADOPT/ADOPT-SUBSET/REJECT written, no `src/` change.


**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation
**Tags:** effect, evaluation, spike, retry, scheduling

## Summary

Spike S2. Effect's retry story is the one pillar where loop-lore is provably
paying for duplication: retry/backoff policy is hand-rolled in **four**
separate places. Measure whether `Effect.retry` + `Schedule` collapses them
into one, without changing behaviour.

## The duplication under test

| Site | What it does |
| ---- | ------------ |
| `src/generation/providers/circuit-breaker.ts` | Circuit-breaker state machine (~190 lines) |
| `src/generation/providers/call-with-failover.ts` | Provider failover loop |
| `src/generation/providers/anthropic/http.ts` | Per-provider exponential backoff + jitter |
| `src/chat/proactive/timing.ts:59` | `backoffMs(baseMs, count)` — `base * 2^count` |

Note up front: a **circuit breaker is not a retry policy.** Effect's `Schedule`
covers backoff, jitter, and retry limits; it does not ship a breaker. If the
breaker survives the spike, that alone disqualifies "delete the hand-rolled
stack" and downgrades any verdict to `ADOPT-SUBSET` at best.

## Method

1. Take **one** real provider call path (the anthropic HTTP path is the best
   candidate — it already owns backoff).
2. Build the `Effect.retry` + `Schedule.exponential` equivalent beside it in
   `.tmp/`, against the same fake transport.
3. Measure: net LOC delta; wall-clock latency on the happy path; and parity on
   the failure path — same attempt count, same backoff curve, same jitter
   envelope, same error surfaced to the caller.
4. Record the numbers in the epic's *Spike Results* table.

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
