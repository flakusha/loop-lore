<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Memory Profiling & Budgets

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** profiling, memory, gc, leaks, endurance
**Parent Epic:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md)

## Overview

Per-component memory tracking with heap, RSS, and GC pressure targets, leak detection, and long-running endurance tests.

## Sub-Epic of

Part of the **Testing, Benchmarking & Performance** epic. See parent epic for shared resource targets and concurrent-user tiers.

## Component Memory Budgets

| Component                    | Heap Max | RSS Max  | GC Budget | Notes                                    |
| ---------------------------- | -------- | -------- | --------- | ---------------------------------------- |
| HTTP server (idle)           | < 10 MB  | < 30 MB  | < 1%      | Elysia + static assets                   |
| HTTP server (per-connection) | < 50 KB  | N/A      | N/A       | Per open connection state                |
| Kysely pool (idle)           | < 5 MB   | < 20 MB  | < 0.5%    | Connection pool + prepared statements    |
| Kysely pool (active)         | < 20 MB  | < 50 MB  | < 2%      | Under load, all connections active       |
| WebSocket server             | < 5 MB   | < 15 MB  | < 1%      | Connection registry + message buffers    |
| Asset pipeline               | < 50 MB  | < 100 MB | < 3%      | During resize/transcode, peak allocation |
| LLM generation buffer        | < 20 MB  | < 40 MB  | < 2%      | Streaming response accumulation          |
| Worker thread (idle)         | < 10 MB  | < 30 MB  | < 0.5%    | Shared-nothing, no leaked state          |
| Worker thread (active)       | < 100 MB | < 200 MB | < 3%      | CPU-bound task execution                 |
| Native module (crypto)       | < 1 MB   | < 10 MB  | N/A       | FFI, no JS heap contribution             |
| Native module (image)        | < 20 MB  | < 50 MB  | N/A       | libvips buffer allocation                |
| Native module (compression)  | < 5 MB   | < 15 MB  | N/A       | Streaming compression buffer             |

## Memory Profiling Metrics

| Metric                         | Target   | Tier     | Notes                                       |
| ------------------------------ | -------- | -------- | ------------------------------------------- |
| Heap used at idle              | < 20 MB  | Baseline | All services initialized, no requests       |
| Heap used at peak              | < 200 MB | Baseline | 1000 concurrent users, active processing    |
| RSS at idle                    | < 60 MB  | Baseline | Resident set, includes V8 overhead          |
| RSS at peak                    | < 500 MB | Baseline | 1000 concurrent users, active processing    |
| External memory                | < 50 MB  | Baseline | Buffers, ArrayBuffer, typed arrays          |
| Array buffer allocations       | < 20 MB  | Baseline | Total active ArrayBuffer/TypedArray         |
| Leak detection threshold       | 0        | Strict   | No leaked objects after GC + 5s settle      |
| Memory growth rate (sustained) | < 1 MB/m | Baseline | No growth under constant request rate       |
| Memory reclamation time        | < 5s     | Baseline | Time to reclaim 90% of peak after load drop |

## GC Pause Budget by Component

| Component                 | Minor GC Budget | Major GC Budget | Notes                              |
| ------------------------- | --------------- | --------------- | ---------------------------------- |
| HTTP request handler      | < 2ms           | < 10ms          | Must not stall request processing  |
| WebSocket message handler | < 1ms           | < 5ms           | Must not stall message dispatch    |
| DB query handler          | < 1ms           | < 5ms           | Must not stall connection pool     |
| Asset pipeline            | < 5ms           | < 20ms          | Longer budget, non-blocking path   |
| LLM streaming             | < 2ms           | < 10ms          | Must not stall token streaming     |
| Worker thread             | < 5ms           | < 20ms          | Isolated, no impact on main thread |

## Design (memory profiler)

```typescript
interface MemoryProfiler {
  // Start profiling
  start(): void;

  // Stop profiling
  stop(): Promise<MemoryProfile>;

  // Take snapshot
  takeSnapshot(): Promise<MemorySnapshot>;

  // Compare snapshots
  compare(before: MemorySnapshot, after: MemorySnapshot,): Promise<MemoryComparison>;

  // Detect leaks
  detectLeaks(): Promise<MemoryLeak[]>;
}

interface MemoryProfile {
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  snapshots: MemorySnapshot[];
  allocations: MemoryAllocation[];
  deallocations: MemoryDeallocation[];
  leaks: MemoryLeak[];
}

interface MemorySnapshot {
  id: string;
  timestamp: Date;
  totalHeapSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
  objects: MemoryObject[];
  strings: MemoryString[];
  arrays: MemoryArray[];
}

interface MemoryLeak {
  id: string;
  type: string;
  size: number;
  count: number;
  location: string;
  stack: string;
  severity: "low" | "medium" | "high" | "critical";
}
```

The CPU/I/O/network/database profilers that complement memory profiling are
specified in Core Testing Frameworks (epic-core-testing-frameworks.md).

## Tasks

- [ ] Implement per-component memory tracking (heap, RSS, external)
- [ ] Add GC pause measurement per request handler
- [ ] Add memory leak detection: long-running endurance tests
- [ ] Add memory reclamation measurement after load drop
- [ ] Add per-component heap snapshot diffing
- [ ] Add RSS tracking over time (memory growth rate)
- [ ] Add external memory tracking (ArrayBuffer, TypedArray)
- [ ] Add GC pressure dashboard (minor/major pause distribution)
- [ ] Add memory regression detection in CI (per-component)
- [ ] Benchmark Worker thread memory isolation under load
- [ ] Benchmark native module memory footprint vs JS equivalent
- [ ] Add memory profiling to asset pipeline (peak allocation tracking)

## Dependencies

- **Parent hub:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md).
- **Siblings:** Concurrency & Runtime Benchmarks (epic-concurrency-runtime-benchmarks.md) supplies worker/GC bench results; Benchmark CI & Performance Regression Detection (epic-benchmark-ci-regression.md) enforces memory regression thresholds; Performance Dashboard & SLO (epic-performance-dashboard-slo.md) renders the GC-pressure panel.

## Files

- `tests/performance/` — endurance + leak-detection suites
- `src/profiling/` — profiling framework (memory profiler lives here)
