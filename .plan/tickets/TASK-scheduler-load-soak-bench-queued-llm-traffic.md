<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Scheduler load-soak bench (queued LLM traffic)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-llm-request-scheduler

**Summary:**

Bench the wired ResourceManager under synthetic queued load: N concurrent requests x M priorities, measuring queueWaitMs p50/p95, denial rate, and starvation (low-priority max wait). Runs against MockLLMProvider (`src/test-utils/mock-provider.ts`) (deterministic, default CI-safe) with an opt-in llama-swap variant for real rotation cost. Catches scheduler regressions FEAT-e2e-performance-benchmarks cannot (it measures unqueued paths). Depends on wire ticket; mock variant lands first, llama-swap variant after LLM bench ticket. Epic: epic-llm-request-scheduler.

**Context:**

Wired-scheduler regressions hide from unqueued benches: FEAT-e2e-performance-benchmarks measures unqueued paths, so queueing/admission drift goes unseen. This bench closes that gap with synthetic queued load.

**Scope:**

Mock-first soak bench for the wired scheduler queue. Default path submits N concurrent jobs across `PriorityLevel` High/Normal/Low bands against `MockLLMProvider`; swap-backed variant (gated `LL_BENCH_LLM=1`) lands after TASK-llm-generation-bench-via-local-llama-swap-opt-in. Consumes `scheduler.queue.wait_ms` + `scheduler.admission.denied` telemetry where available; defines no new event types.

**Acceptance Criteria:**

- [ ] New `tests/benchmarks/scheduler-soak.bench.ts` auto-discovered by `scripts/run-benchmarks.ts` (`BENCH_GLOB = /\.bench\.ts$/`); `bun run bench scheduler-soak` exits 0 on pass.
- [ ] Load shape: N concurrent `ResourceManager.submit` calls (`src/llm/resource-manager.ts:78`) spread across `PriorityLevel.High/Normal/Low` (`src/llm/resource-manager-types.ts:14-20`); mock `run` bodies use `MockLLMProvider` (`src/test-utils/mock-provider.ts:35`). No `MockScenarioProvider` exists — do not invent one.
- [ ] Reports queue-wait p50/p95 per priority class, denial count, low-priority max-wait — reported, no threshold asserted.
- [ ] Consumes `scheduler.queue.wait_ms` + `scheduler.admission.denied` via telemetry `record` (`src/telemetry/service.ts:65`) once TASK-llm-scheduler-observability lands; until then computes wait from submit/dequeue timestamps locally. Defines no new event types.
- [ ] llama-swap variant gated `LL_BENCH_LLM=1`, lands after TASK-llm-generation-bench-via-local-llama-swap-opt-in; unset flag runs mock-only path and exits 0. CI-safe default touches no network.

**Reuse refs:** `src/llm/resource-manager.ts:78` (`submit`), `src/llm/resource-manager-types.ts:14-20` (`PriorityLevel`), `src/test-utils/mock-provider.ts:35` (`MockLLMProvider`), `src/telemetry/service.ts:65` (`record`), `scripts/run-benchmarks.ts:25` (auto-discovery), normative contract §6/§8 (read-only: `tree/feat-llm-scheduler-docs/docs/spec/generation-scheduler.md`).
