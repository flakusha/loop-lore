<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Concurrency & Runtime Benchmarks

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** benchmarking, concurrency, workers, gc, performance
**Parent Epic:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md)

## Overview

Benchmark Bun's async execution model extensions — Worker threads, `Bun.spawn`, task queues, and GC pressure — against the execution-model targets defined in the parent epic.

## Sub-Epic of

Part of the **Testing, Benchmarking & Performance** epic. See parent epic for the shared Execution Model Targets, Concurrency Patterns, and GC Pressure Metrics tables (moved targets remain authoritative there).

## Scope

- Worker thread spawn/IPC/memory benchmarks
- `Bun.spawn` process overhead and pipe throughput
- Task queue throughput (bounded in-memory, persistent SQLite-backed)
- Hybrid event-loop + worker patterns
- GC pause distribution per execution mode

## Tasks

- [ ] Benchmark Worker thread spawn overhead (cold/warm)
- [ ] Benchmark Worker thread IPC throughput (serialized buffers)
- [ ] Benchmark `postMessage` with SharedArrayBuffer
- [ ] Benchmark Worker pool scaling (1 to 64 workers)
- [ ] Benchmark GC pause distribution across Worker count
- [ ] Benchmark `Bun.spawn` process overhead vs Worker thread
- [ ] Benchmark `Bun.spawn` stdin/stdout throughput
- [ ] Benchmark task queue throughput (bounded, in-memory)
- [ ] Benchmark task queue throughput (persistent, SQLite-backed)
- [ ] Benchmark hybrid event-loop + worker patterns
- [ ] Benchmark backpressure handling under sustained load
- [ ] Benchmark Worker memory isolation (no shared heap)
- [ ] Benchmark context-switching cost between Workers

## Dependencies

- **Parent hub:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md) — owns the Execution Model Targets / Concurrency Patterns / GC Pressure Metrics tables this epic measures against.
- **Siblings:** Benchmark CI & Performance Regression Detection (epic-benchmark-ci-regression.md) wires these benches into `bench:ci`; Memory Profiling & Budgets (epic-memory-profiling-budgets.md) consumes worker memory-isolation results.

## Files

- `tests/benchmarks/` — worker/spawn/task-queue/GC benchmark suites
