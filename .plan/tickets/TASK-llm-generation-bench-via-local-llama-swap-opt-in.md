<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: LLM generation bench via local llama-swap (opt-in)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-llm-request-scheduler

**Summary:**

Opt-in bench in tests/benchmarks/ using local llama-swap + llama-server binaries (present on dev host). Measures LLM round-trip p50/p95/p99, token rate, and model-rotation cost. Default-off (LL_BENCH_LLM=1), graceful skip when binaries/models missing (skip-and-exit-0 posture, cf. `src/generation/image-engine/index.test.ts:63` `it.skipIf`). Results feed epic-llm-request-scheduler admission tuning (slot caps, rotation policy) and epic-performance-dashboard-slo LLM panel (p95<5s, >20 tok/s). Depends on TASK-wire-llm-resource-manager-into-generation-dispatch for queue-wait attribution; standalone latency numbers land first. Epic: epic-llm-request-scheduler.

**Context:**

Admission tuning (slot caps, rotation policy) needs real local-LLM latency numbers, not mock timings. llama-swap + llama-server binaries exist on the dev host; CI and other machines lack them, so the bench must be default-off with a clean skip.

**Scope:**

Standalone opt-in bench in `tests/benchmarks/` against the local swap proxy. Standalone round-trip numbers land first; queue-wait attribution comes later via TASK-wire-llm-resource-manager-into-generation-dispatch. No new telemetry events; no external network.

**Acceptance Criteria:**

- [ ] New `tests/benchmarks/llm-generation.bench.ts` auto-discovered by `scripts/run-benchmarks.ts` (`BENCH_GLOB = /\.bench\.ts$/`); `bun run bench llm-generation` runs it in isolation (own Bun process per runner design).
- [ ] Skip posture: `LL_BENCH_LLM` unset → prints skip reason, exits 0; binaries/models missing → graceful skip exit 0 (binary-missing null precedent `tests/e2e/helpers/server-external.ts:158-163`; gated-test precedent `src/generation/image-engine/index.test.ts:63` `it.skipIf`; in-tree binary-missing precedent `tests/e2e/flows/real-generation.test.ts` — it spawns llama.cpp and skips gracefully when binaries/models are absent, which is the posture this bench copies, with the gate inverted to `LL_BENCH_LLM` opt-in).
- [ ] When enabled (`LL_BENCH_LLM=1`) with local proxy up: reports round-trip p50/p95/p99 + token rate + model-rotation cost — reported, no threshold asserted (standalone numbers first; feeds later admission tuning).
- [ ] Local-only: proxy started via `startLlamaSwap` (`src/services/server-external-manager/start-llama.ts:166`) with liveness probe (`tests/e2e/helpers/server-external.ts:62,176`); never touches external network or API keys. CI-safe default is skip.
- [ ] Queue-wait attribution deferred: depends on TASK-wire-llm-resource-manager-into-generation-dispatch; v1 reports pure generation latency only, no scheduler join.

**Reuse refs:** `scripts/run-benchmarks.ts:25` (auto-discovery), `src/services/server-external-manager/start-llama.ts:166` (`startLlamaSwap`), `src/services/server-external-manager/start-llama.ts:214-223` (fail-open config-read precedent), `tests/e2e/helpers/server-external.ts:158-163` (missing-binary skip), normative contract §8 ticket map (read-only: `tree/feat-llm-scheduler-docs/docs/spec/generation-scheduler.md`).
