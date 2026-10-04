<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Scheduler load-soak bench (queued LLM traffic)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`

**Summary:** Bench the wired `ResourceManager` under synthetic queued load: N concurrent requests × M priorities, measuring queue-wait p50/p95, denial rate, and low-priority starvation (max wait). Mock variant first (deterministic, CI-safe via `MockLLMProvider`); llama-swap variant after the LLM bench ticket lands. Catches scheduler regressions `FEAT-e2e-performance-benchmarks` cannot (it measures unqueued paths). Depends on the wire ticket.

**Context:** The wire ticket lands behavior-preserving (no request ever waits). Without a soak bench, a later policy ticket could silently reintroduce head-blocking or starvation and no existing test would catch it — unit tests cover the queue in isolation, not dispatch under load.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] New `tests/benchmarks/scheduler-soak.bench.ts`, auto-discovered by `scripts/run-benchmarks.ts`; always runs in CI (mock variant has no external deps).
- [ ] Mock variant: N concurrent `ResourceManager.submit()` calls across `PriorityLevel.High/Normal/Low` against `MockLLMProvider` (`src/test-utils/mock-provider.ts`); reports queue-wait p50/p95 per class, denial count, and low-priority max wait.
- [ ] Starvation check: low-priority max wait is bounded (finite, reported) under sustained high-priority pressure — documents the fairness posture, no invented threshold.
- [ ] llama-swap variant gated on `LL_BENCH_LLM=1` (same skip-and-exit-0 posture as the LLM bench ticket); runs only after `TASK-llm-generation-bench-via-local-llama-swap-opt-in` lands.
- [ ] Consumes the observability events (`scheduler.queue.wait_ms`, `scheduler.admission.denied`); defines no new ones.
- [ ] `bun run check` green; SPDX header per convention.

## Reuse refs

- `src/llm/resource-manager.ts:78` — `submit({ id, provider, priority, run })`
- `src/llm/resource-manager-types.ts:14-18` — `PriorityLevel` bands under load
- `src/test-utils/mock-provider.ts` — `MockLLMProvider` deterministic backend
- `scripts/run-benchmarks.ts` — runner (reuse, do not extend)
- `src/telemetry/service.ts:65,111` — `record` / `isTelemetryEnabled` event sink
