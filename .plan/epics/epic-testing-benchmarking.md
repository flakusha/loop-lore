<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Testing, Benchmarking & Performance

**Status:** 🟡 In Progress — benchmark suite structure defined + first benchmark shipped (2026-08-15, branch `native-blake3`); broader framework tasks open
**Priority:** High
**Effort:** Very High (split into 7 sub-epics)
**Type:** Infrastructure Epic
**Tags:** testing, benchmarking, performance, load-testing, profiling

## Summary

Comprehensive testing infrastructure including unit tests, e2e tests, benchmarking, performance testing, pressure/fuzzing, bottleneck detection, and security testing. Ensure good practices don't negatively impact performance while maintaining security and data integrity.

> **⚠️ This epic is too large to ship in one pass.** It has been split into 7 sub-epics below. Each sub-epic delivers independently shippable value.

## Sub-Epics

| Sub-Epic                          | Epic File                                    | Scope                                                                                    | Priority |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| **Core Testing Frameworks**       | `epic-core-testing-frameworks.md`            | Unit/integration/E2E/security framework architecture, load/stress/spike/endurance        | High     |
| **Benchmark CI & Regression**     | `epic-benchmark-ci-regression.md`            | Benchmark suite, baseline comparison, perf-regression CI workflow, thresholds/reports    | High     |
| **Concurrency & Runtime Benches** | `epic-concurrency-runtime-benchmarks.md`     | Worker/spawn/task-queue/GC benchmarks vs execution-model targets                         | High     |
| **Native/WASM Module Benchmarks** | `epic-native-module-benchmarks.md`           | FFI-vs-WASM-vs-pure-JS per module, load/init overhead, fallback chain                    | High     |
| **Memory Profiling & Budgets**    | `epic-memory-profiling-budgets.md`           | Per-component heap/RSS/GC budgets, leak detection, endurance tests                       | High     |
| **Fuzzing Infrastructure**        | `epic-fuzzing-infrastructure.md`             | Harness runner/corpora/mutation engine/sanitizers/CI targets/crash triage                | Medium   |
| **Performance Dashboard & SLO**   | `epic-performance-dashboard-slo.md`          | Prometheus endpoints/SLO/error budget/alerting/dashboard UI/historical storage           | High     |

## Slicing Rationale

The original epic mixed test-framework architecture, runtime benchmarks, memory budgets, fuzzing, and observability in one file (~1,400 lines). Splitting lets each concern land independently:

1. **Core Testing Frameworks** — the widest scope; verify against the already-shipped repo test setup (`bun test`, `tests/e2e`) first.
2. **Benchmark CI & Regression** — builds directly on the shipped `tests/benchmarks/` suite; good near-term slice.
3. **Concurrency & Runtime / Native Module Benchmarks** — extend the same suite with execution-model and FFI/WASM benches.
4. **Memory Profiling & Budgets** — depends on bench infrastructure for endurance/leak runs.
5. **Fuzzing Infrastructure** — independent security workstream.
6. **Performance Dashboard & SLO** — consumes results from all other sub-epics; last to land.

## Shared Performance Targets & SLOs

These targets are cross-cutting: every benchmarking sub-epic measures against
them, and Performance Dashboard & SLO tracks compliance with them.

### API Latency Targets

| Metric             | Target  | Tier     | Notes                          |
| ------------------ | ------- | -------- | ------------------------------ |
| API p50 latency    | < 20ms  | Baseline | Non-LLM endpoints (auth, CRUD) |
| API p95 latency    | < 50ms  | Baseline | Non-LLM endpoints              |
| API p99 latency    | < 200ms | Baseline | Non-LLM endpoints              |
| LLM round-trip p95 | < 5s    | LLM      | Includes generation time       |
| LLM round-trip p99 | < 15s   | LLM      | Includes generation time       |

### Throughput Targets

| Metric              | Target        | Tier     | Notes                         |
| ------------------- | ------------- | -------- | ----------------------------- |
| Concurrent sessions | 1,000         | Baseline | Single instance, 1 CPU        |
| Concurrent sessions | 10,000        | High     | Multi-instance, load balanced |
| Message throughput  | > 500 msg/s   | Baseline | User-to-user chat, no LLM     |
| Message throughput  | > 5,000 msg/s | High     | With LLM generation pipeline  |
| Asset upload        | > 50 MB/s     | Baseline | Local SSD                     |
| Asset upload        | > 20 MB/s     | Baseline | Network (1 Gbps LAN)          |
| Asset retrieval     | > 100 MB/s    | Baseline | Cached, local SSD             |
| Asset retrieval     | > 10 MB/s     | Baseline | Cold, network                 |

### Resource Targets

| Metric               | Target   | Notes          |
| -------------------- | -------- | -------------- |
| Memory per session   | < 5 MB   | Idle session   |
| Memory per session   | < 50 MB  | Active session |
| CPU per 100 sessions | < 1 core | Baseline       |
| DB query p95         | < 10ms   | Simple queries |
| DB query p95         | < 50ms   | Complex joins  |

### Ultra-Low Latency Hot-Path Targets (~1ms)

Aggressive round-trip targets for non-LLM synchronous operations. These represent
the achievable floor for Bun's optimized async I/O on local and LAN paths.

| Metric                      | Target  | Tier     | Notes                                            |
| --------------------------- | ------- | -------- | ------------------------------------------------ |
| JSON parse + serialize      | < 0.1ms | Hot-path | `JSON.parse` / `JSON.stringify` on small objects |
| In-memory CRUD round-trip   | < 0.5ms | Hot-path | Kysely SELECT/INSERT/UPDATE, single row, no join |
| Auth token verify (JWT)     | < 0.2ms | Hot-path | `crypto.verify` on Ed25519, cached key           |
| WebSocket frame dispatch    | < 0.3ms | Hot-path | Server→client, measured at event loop tick       |
| File read (cached, < 64 KB) | < 0.5ms | Hot-path | `Bun.file().arrayBuffer()` from OS page cache    |
| DB connection acquire       | < 0.2ms | Hot-path | Kysely pool reuse, no TCP reconnect              |
| Middleware chain (auth+log) | < 0.5ms | Hot-path | Combined auth + structured log, per-request      |
| Full non-LLM API round-trip | < 1ms   | Hot-path | Network + parse + handler + serialize + respond  |
| Full non-LLM API p99        | < 5ms   | Baseline | Inclusive of worst-case GC pause                 |
| Full non-LLM API p99.9      | < 20ms  | Baseline | Inclusive of GC + cold DB pool                   |

> **Achievability note:** The ~1ms full round-trip is measured from TCP connect to
> response bytes flushed, on localhost with a warm Kysely pool, warm OS page cache,
> and no GC pressure. On LAN (RTT < 0.5ms) the achievable floor is ~1.5ms.
> These targets assume Bun's single-threaded event loop; the Concurrency &
> Runtime Benchmarks sub-epic defines the threading extensions.

### Concurrent User Tiers

Shared by Core Testing Frameworks (load/stress/spike/endurance suites) and
Memory Profiling & Budgets (endurance tests).

| Tier      | Users  | Duration | Purpose               |
| --------- | ------ | -------- | --------------------- |
| Smoke     | 10     | 1 min    | Basic functionality   |
| Light     | 100    | 5 min    | Typical load          |
| Medium    | 1,000  | 15 min   | Peak load             |
| Heavy     | 10,000 | 30 min   | Stress test           |
| Endurance | 1,000  | 24h+     | Memory leak detection |

## Linked Tasks

- TASK-testing-benchmarking.md
