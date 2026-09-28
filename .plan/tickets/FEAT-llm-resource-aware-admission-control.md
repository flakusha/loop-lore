<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Resource-aware admission control

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`
**Summary:** Adds an admission gate between dequeue and dispatch that answers "can this provider take this request right now?" — local slot budget, external in-flight cap, and windowed token/request budgets — plus reactive narrowing of the cap when a provider returns 429. Priority decides *order*; this decides *whether now*.
**Context:** Priority alone does not bound throughput. With every provider cap set generously enough to never queue, a burst of aux + embedding traffic will still overshoot a local llama-swap slot budget, and external keys will still trip 429s. A 429 is `retryable`, so it is re-attempted by the shared policy at `src/generation/providers/retry.ts:47` (1s base, capped at 10s, `retries` attempts from `ProviderInstanceConfig.retries`); the caller blocks for that whole span while holding no local slot. This ticket is the second half of the epic's scheduling decision.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] An `AdmissionController` sits between the `ResourceManager` queue and `callWithFailover`. Its decision is per **provider**, because a saturated remote API says nothing about a free local GPU.
- [ ] **Local providers** (llama-swap, llama.cpp) admit against the configured concurrent-slot count from `FEAT-llm-scheduler-config-surface`. No per-request live VRAM/RAM probe on the hot path — the configured slot count is the calibration knob.
- [ ] **External providers** admit against (a) a per-provider in-flight cap and (b) a windowed budget (per-minute and per-day) over estimated prompt+output tokens. A request that would exceed the windowed budget waits rather than being dispatched into a guaranteed 429.
- [ ] Window counters are **estimated** from `estimateTokens` before dispatch and **corrected** from the provider-reported `usage.promptTokens` / `usage.completionTokens` on response (available on `GenerateResponse.usage`, already populated at `src/aux-pipeline/runner.ts:134-137`). Estimation is a scheduler input, not a billing record.
- [ ] **Reactive narrowing:** a `ProviderRateLimitError` (429) or an open circuit for a provider narrows that provider's effective in-flight cap. The circuit breaker remains the sole source of truth for provider aliveness; the cap only tightens and recovers. Recovery is time-based (a cooldown that restores the configured cap), not triggered by a single success.
- [ ] A denied admission re-queues the request at its existing priority — it does not reject, and it does not reorder. Fairness within a priority band is preserved under sustained saturation (no starvation of any class).
- [ ] Bounded wait: a request that cannot be admitted within a configured timeout fails with a typed error surfaced to the existing generation-failure path, rather than hanging an SSE stream forever.
- [ ] Cancellation remains correct under saturation: a request waiting on admission aborts cleanly via the existing `AbortController` path.
- [ ] Tests cover: cap enforcement per provider, provider isolation (a saturated provider does not block an unrelated one), budget exhaustion and window rollover, 429-driven narrowing and time-based recovery, and non-starvation under a sustained overload.
- [ ] Metrics are emitted for admit / deny / narrow, per provider. (`TASK-llm-scheduler-observability` owns the dashboard surface; this ticket only emits the events.)
- [ ] `bun run check` green; new modules clear the 80% coverage floor.

## Notes

**Do not probe VRAM per request.** A synchronous resource probe on the interactive path adds latency to the one request a human is actively waiting on, in exchange for a signal that is noisy and already implied by the slot count. If live headroom becomes necessary it is a periodic sampler that adjusts the effective cap — the same knob, driven by a slower signal. This is the deliberate, named ceiling: configured slots, not measured headroom.

**Learning, not replacement.** The 429 feedback loop narrows the cap; it does not supersede the circuit breaker. Three layers, three jobs: the scheduler admits, the breaker decides aliveness, the retry loop handles transient faults. Do not fold retry into admission: `withProviderRetry` already owns the delay schedule and the retryability rule, and the Effect spike (S2) deliberately consolidated the three byte-identical provider backoff loops into that one shared module. Re-deriving a delay schedule in the scheduler re-opens duplication that was just closed.

**Fairness is a test, not an intention.** Under sustained saturation, a strict priority queue starves the lowest band forever. That is acceptable for interactive vs. background (background is droppable) but not within a band. Assert non-starvation rather than trusting the queue's FIFO tiebreak.

## Related Files

- `src/llm/resource-manager.ts` — the queue this gates
- `src/generation/providers/call-with-failover.ts:25` — the dispatch being gated
- `src/generation/providers/circuit-breaker.ts:44,117` — aliveness source of truth, untouched
- `src/generation/providers/types.ts:166-175` — `ProviderRateLimitError` (429, carries `retryAfter`)
- `src/chat/token-utils.ts` — `estimateTokens` for the budget estimate
- `.plan/epics/epic-llm-request-scheduler.md` — parent epic


git issue: 3202973
