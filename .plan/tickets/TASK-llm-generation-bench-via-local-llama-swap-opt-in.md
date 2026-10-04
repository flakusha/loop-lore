<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: LLM generation bench via local llama-swap (opt-in)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`

**Summary:** Opt-in bench in `tests/benchmarks/` measuring real LLM round-trip latency (p50/p95/p99), token rate, and model-rotation cost against the local llama-swap + llama-server binaries already present on the dev host. Default-off behind `LL_BENCH_LLM=1` with graceful skip when binaries or models are missing. Standalone latency numbers land first (no scheduler attribution); queue-wait attribution is layered on after the wire ticket lands.

**Context:** Admission tuning (slot caps) and the rotation policy (`FEAT-llama-swap-rotation-exclusion-policy`) need at least one real number — how long a swap actually costs vs a warm hit — or the policy gates on a guessed threshold. The e2e performance ticket (`FEAT-e2e-performance-benchmarks`) measures unqueued paths and cannot supply it.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] New `tests/benchmarks/llm-generation.bench.ts`, auto-discovered by `scripts/run-benchmarks.ts` (no runner change; follows the `*.bench.ts` convention in `tests/benchmarks/`).
- [ ] Gated on `LL_BENCH_LLM=1`; when unset, or when the llama-swap binary / model path is absent, prints `skip: <reason>` and exits 0 — never fails CI.
- [ ] Reports per-model round-trip p50/p95/p99, tokens/sec from `GenerateResponse.usage`, and rotation cost (cold-model first request vs warm repeat) against the models in `configs/config.llama-swap.example.yaml`.
- [ ] No invented baselines: output is raw numbers + host note, no pass/fail threshold in v1.
- [ ] `bun run check` green; bench file carries the SPDX header per repo convention.

## Reuse refs

- `scripts/run-benchmarks.ts` — discovery + sequential-runner (reuse, do not extend)
- `tests/benchmarks/zstd.bench.ts` — output pattern (JSON results + human summary lines)
- `configs/config.llama-swap.example.yaml` — model set under test
- `src/generation/providers/types.ts` — `GenerateResponse.usage` for token-rate math
