<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Effect v4 scoped concurrency and interruption spike

**Summary:** Test Effect v4 fork-scoped concurrency and interruption against the ~125-line async semaphore plus ad-hoc `try/finally` cleanup.
**Context:** Epic epic-effect-v4-adoption-evaluation. The bar is cleanup correctness, not LOC — a working semaphore is not a problem, so Effect wins only if scoped interruption kills a reproducible leak or orphaned-task class.
**Acceptance Criteria:** See ## Acceptance Criteria below — a cancellation case reproduced (or its absence recorded), the fork-scoped run compared, LOC measured, one of ADOPT/ADOPT-SUBSET/REJECT written, no `src/` change.


**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation
**Tags:** effect, evaluation, spike, concurrency, resource-safety

## Summary

Spike S3. loop-lore bounds concurrency with a hand-written async semaphore
(`src/llm/concurrency-limiter.ts`, ~125 lines) and cleans up long-running work
with ad-hoc `try/finally`. Effect offers fork-scoped concurrency with structured
interruption. The question is whether the interruption guarantee is worth the
rewrite — not whether the LOC is smaller.

## What is under test

| Current | Effect v4 candidate |
| ------- | ------------------- |
| `src/llm/concurrency-limiter.ts` — async semaphore | `Effect.all(..., { concurrency: n })` |
| `try/finally` cleanup on cancellation-prone paths (e.g. `src/async/offload.ts`) | `Effect.forkScoped` + scoped finalizers, interruption on scope exit |
| No structured cancellation story for background work | `Effect.interrupt` / fiber interruption |

**The bar is cleanup correctness, not LOC.** A semaphore plus `try/finally` is
~125 lines and works. Effect wins only if scoped interruption removes a class of
leaked-resource or orphaned-task bug that the semaphore cannot express. If the
spike cannot name such a bug in the current code, the verdict is `REJECT`.

## Method

1. Pick one long-running path (generation dispatch or the async offload pass).
2. Reproduce the cancellation case against the current code — a cancelled
   request, an aborted stream, a shutdown mid-flight. Record what leaks or
   hangs today.
3. Build the fork-scoped equivalent in `.tmp/` and run the same cancellation.
4. Measure: LOC delta, plus whether the leak/hang from step 2 is actually gone.
5. Record the numbers in the epic's *Spike Results* table.

## Acceptance Criteria

- [ ] A concrete cancellation/leak case is reproduced against the current semaphore path, or the ticket records that none could be reproduced
- [ ] The same case is run against the fork-scoped version and its behaviour recorded
- [ ] Cleanup correctness, not LOC, is the stated basis of the verdict
- [ ] Net LOC delta recorded in the epic's *Spike Results* row S3
- [ ] A written verdict of `ADOPT` / `ADOPT-SUBSET` / `REJECT` is recorded; a `REJECT` must name what ships instead
- [ ] No `src/` file is modified — this is a measurement ticket

## Files

- `.tmp/effect-concurrency-spike/` — scratch harness (git-ignored, delete before merge)
- `.plan/epics/epic-effect-v4-adoption-evaluation.md` — *Spike Results* row S3

## Dependencies

- Blocked by: `TASK-effect-v4-bun-esm-typecheck-compatibility-spike` (hard gate)
- Reads: `src/llm/concurrency-limiter.ts`, `src/async/offload.ts`
- Reuse: check `epic-concurrency-runtime-benchmarks.md` first — if a benchmark harness already exists there, use it instead of building a second one
