<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Benchmark CI & Performance Regression Detection

**Status:** 🟡 In Progress — benchmark suite structure defined + first benchmark shipped (2026-08-15, branch `native-blake3`)
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** benchmarking, ci, performance, regression
**Parent Epic:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md)

## Overview

Benchmarks run on every PR via GitHub Actions, comparing against the baseline (main branch). Results stored as artifacts for historical analysis.

## Sub-Epic of

Part of the **Testing, Benchmarking & Performance** epic. See parent epic for shared performance targets, SLO tables, and concurrent-user tiers.

## Scope

- Benchmark suite structure and discovery runner (`tests/benchmarks/`, `scripts/run-benchmarks.ts`)
- Baseline comparison runner (`bench:compare`)
- Per-metric regression thresholds with merge blocking
- Perf-regression CI workflow (`.github/workflows/perf-regression.yml`)
- Historical results storage and report generation

## Shipped (2026-08-15, branch `native-blake3`)

- **Suite structure:** `tests/benchmarks/` dir + discovery runner
  `scripts/run-benchmarks.ts` — `bun run bench` (all), `bench:native`
  (blake3), `bench:ci` (CI-compatible). Per-bench process isolation
  (fresh native load), sequential execution, non-zero exit on failure.
  Kept out of the `bun test` unit gate (perf ≠ correctness).

## CI Workflow

```yaml
# .github/workflows/perf-regression.yml
name: Performance Regression
on:
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 2 * * 1" # Weekly on Mondays

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven/setup-bun@v1
      - run: bun install
      - run: bun run bench:ci
      - uses: actions/upload-artifact@v4
        with:
          name: benchmark-results
          path: tests/benchmarks/results/
      - name: Check regression
        run: bun run bench:compare
```

## Regression Thresholds

| Metric             | Regression Threshold | Action on PR |
| ------------------ | -------------------- | ------------ |
| API p95 latency    | > 10% increase       | Block merge  |
| API p99 latency    | > 15% increase       | Block merge  |
| Message throughput | > 5% decrease        | Block merge  |
| Memory usage       | > 10% increase       | Block merge  |
| CPU usage          | > 15% increase       | Block merge  |
| DB query p95       | > 10% increase       | Block merge  |

## Configuration

```typescript
interface PerfRegressionConfig {
  // Benchmarks to run
  benchmarks: string[];

  // Baseline branch to compare against
  baselineBranch: string;

  // Regression thresholds per metric
  thresholds: Record<string, {
    maxIncrease: number; // percentage
    maxDecrease: number; // percentage
  }>;

  // Environment configuration
  environment: {
    cpu: number; // CPU cores
    memory: number; // GB
    storage: string; // 'ssd' | 'hdd'
  };

  // Output format
  output: {
    format: "json" | "junit" | "github";
    path: string;
  };
}
```

## Design

```typescript
interface BenchmarkFramework {
  // Benchmark runner
  runner: BenchmarkRunner;

  // Benchmark suite
  suite: BenchmarkSuite;

  // Benchmark reporter
  reporter: BenchmarkReporter;

  // Benchmark analyzer
  analyzer: BenchmarkAnalyzer;
}

interface BenchmarkRunner {
  // Run benchmark
  run(benchmark: Benchmark,): Promise<BenchmarkResult>;

  // Run benchmark suite
  runSuite(suite: BenchmarkSuite,): Promise<BenchmarkSuiteResult>;

  // Run benchmark comparison
  compare(baseline: Benchmark, current: Benchmark,): Promise<BenchmarkComparison>;

  // Run benchmark regression
  regression(baseline: Benchmark, current: Benchmark,): Promise<BenchmarkRegression>;
}

interface Benchmark {
  id: string;
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<void>;
  teardown: () => Promise<void>;
  iterations: number;
  warmup: number;
  timeout: number;
}

interface BenchmarkResult {
  id: string;
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  standardDeviation: number;
  percentiles: Record<string, number>;
  memoryUsage: MemoryUsage;
  cpuUsage: CPUUsage;
  errors: string[];
}

interface BenchmarkSuite {
  id: string;
  name: string;
  description: string;
  benchmarks: Benchmark[];
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
}

interface BenchmarkSuiteResult {
  id: string;
  name: string;
  results: BenchmarkResult[];
  totalTime: number;
  summary: BenchmarkSummary;
}

interface BenchmarkComparison {
  baseline: BenchmarkResult;
  current: BenchmarkResult;
  difference: BenchmarkDifference;
  regression: boolean;
  improvement: boolean;
  changes: BenchmarkChange[];
}

interface BenchmarkDifference {
  time: number; // percentage
  memory: number; // percentage
  cpu: number; // percentage
  throughput: number; // percentage
}

interface BenchmarkChange {
  metric: string;
  baseline: number;
  current: number;
  difference: number;
  percentage: number;
  significant: boolean;
}
```

## Tasks

- [x] Define benchmark suite structure (`tests/benchmarks/`) — ✅ first entry + discovery runner shipped 2026-08-15
- [ ] Implement benchmark runner with baseline comparison
- [ ] Add API latency benchmarks (p50/p95/p99)
- [ ] Add message throughput benchmarks
- [ ] Add asset upload/download benchmarks
- [ ] Add memory/CPU profiling benchmarks
- [ ] Add DB query benchmarks
- [ ] Implement regression threshold checking
- [ ] Add CI workflow for perf regression
- [ ] Add historical results dashboard
- [ ] Add performance report generation

## Dependencies

- **Parent hub:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md) — shared SLO/targets tables.
- **Siblings:** Native/WASM Module Performance Benchmarks (epic-native-module-benchmarks.md) supplies the existing `bench:native` entries; Concurrency & Runtime Benchmarks (epic-concurrency-runtime-benchmarks.md) adds worker/GC benches to the CI matrix; Performance Dashboard & SLO (epic-performance-dashboard-slo.md) consumes historical results.

## Files

- `tests/benchmarks/` — benchmark suites + results artifacts
- `scripts/run-benchmarks.ts` — discovery/runner
- `.github/workflows/perf-regression.yml` — perf regression workflow
