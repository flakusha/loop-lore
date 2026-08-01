# EPIC: Testing, Benchmarking & Performance

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High
**Type:** Infrastructure Epic
**Tags:** testing, benchmarking, performance, load-testing, profiling

## Summary

Comprehensive testing infrastructure including unit tests, e2e tests, benchmarking, performance testing, pressure/fuzzing, bottleneck detection, and security testing. Ensure good practices don't negatively impact performance while maintaining security and data integrity.

## Core Features

### Round-Trip Request Testing

- Heavy request round-trip tests (may require LLM)
- Request/response validation
- Latency measurement
- Throughput testing
- Error rate monitoring
- Concurrent request handling

### Chat Performance Testing

- User-to-user chat without LLMs
- Group chat without LLMs
- Message throughput
- Message ordering
- Message delivery reliability
- Concurrent user handling

### Asset Performance Testing

- Asset addition performance
- Asset upload throughput
- Asset storage performance
- Asset retrieval performance
- Asset transformation performance
- Asset deletion performance

### Application Performance Testing

- Frontend performance (load time, rendering, interactions)
- Backend performance (API response time, throughput)
- Database performance (query time, connection pooling)
- Network performance (latency, bandwidth)
- Memory usage and leaks
- CPU usage and optimization

### Pressure & Fuzzing Testing

- Load testing (high concurrent users)
- Stress testing (beyond capacity)
- Spike testing (sudden load increases)
- Endurance testing (sustained load)
- Fuzz testing (random/malformed inputs)
- Chaos engineering (failure injection)

### Bottleneck Detection

- Performance profiling
- Memory profiling
- CPU profiling
- I/O profiling
- Network profiling
- Database profiling

### Pattern Application Testing

- Good practices vs. performance impact
- Code pattern benchmarking
- Architecture pattern benchmarking
- Design pattern benchmarking
- Refactoring impact analysis
- Technical debt measurement

### Security Testing

- Security vs. performance trade-offs
- Authentication performance
- Authorization performance
- Encryption performance
- Input validation performance
- Rate limiting performance

## Performance Targets & SLOs

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
> These targets assume Bun's single-threaded event loop; the async execution model
> section below defines the threading extensions.

### Concurrent User Tiers

| Tier      | Users  | Duration | Purpose               |
| --------- | ------ | -------- | --------------------- |
| Smoke     | 10     | 1 min    | Basic functionality   |
| Light     | 100    | 5 min    | Typical load          |
| Medium    | 1,000  | 15 min   | Peak load             |
| Heavy     | 10,000 | 30 min   | Stress test           |
| Endurance | 1,000  | 24h+     | Memory leak detection |

## Concurrency & Async Execution Model

Bun's single-threaded event loop is the baseline. For CPU-bound and high-concurrency
workloads, Bun provides Worker threads, `Bun.spawn`, and task queues.

### Execution Model Targets

| Metric                        | Target              | Tier     | Notes                                  |
| ----------------------------- | ------------------- | -------- | -------------------------------------- |
| Event loop tick latency       | < 0.1ms             | Baseline | Single-threaded, no blocking ops       |
| Worker thread spawn overhead  | < 5ms               | Baseline | `new Worker()` to ready state          |
| Worker thread IPC throughput  | > 10,000 msg/s      | Baseline | `postMessage` serialized, 1 KB payload |
| `Bun.spawn` process overhead  | < 10ms              | Baseline | Fork to first stdout byte              |
| `Bun.spawn` IPC throughput    | > 5,000 msg/s       | Baseline | Stdin/stdout pipe, 1 KB payload        |
| Task queue throughput         | > 50,000 tasks/s    | Baseline | In-memory queue, no I/O                |
| Task queue latency (p99)      | < 1ms               | Baseline | From enqueue to dequeue                |
| Worker thread memory overhead | < 10 MB per worker  | Baseline | Idle worker, shared nothing            |
| Worker thread memory overhead | < 100 MB per worker | Active   | Active worker with workspace           |
| Max concurrent workers        | 16 (CPU cores)      | Baseline | One per core, no contention            |
| Max concurrent workers        | 64                  | High     | Oversubscribed, I/O-bound tasks only   |

### Concurrency Patterns to Benchmark

| Pattern                        | Throughput Target | Latency Target | Notes                             |
| ------------------------------ | ----------------- | -------------- | --------------------------------- |
| Single-thread event loop       | > 10,000 req/s    | p99 < 5ms      | Default, non-blocking I/O only    |
| Worker pool (N workers)        | > 50,000 req/s    | p99 < 10ms     | CPU-bound tasks offloaded         |
| `Bun.spawn` child process pool | > 5,000 req/s     | p99 < 50ms     | Isolated processes, crash-safe    |
| Hybrid (event loop + workers)  | > 100,000 req/s   | p99 < 5ms      | I/O on event loop, CPU in workers |
| Task queue (bounded)           | > 50,000 tasks/s  | p99 < 1ms      | In-memory, backpressure-aware     |
| Task queue (persistent)        | > 10,000 tasks/s  | p99 < 5ms      | SQLite-backed, crash-recoverable  |

### GC Pressure Metrics

Bun's GC is generational. Track GC pauses per execution mode:

| Metric                | Target    | Tier     | Notes                                    |
| --------------------- | --------- | -------- | ---------------------------------------- |
| GC minor pause p50    | < 0.5ms   | Baseline | Young generation collection              |
| GC minor pause p99    | < 2ms     | Baseline | Young generation collection              |
| GC major pause p50    | < 5ms     | Baseline | Old generation collection                |
| GC major pause p99    | < 20ms    | Baseline | Old generation collection                |
| GC heap growth rate   | < 50 MB/s | Baseline | Max heap growth before major GC          |
| GC heap live ratio    | < 60%     | Baseline | Live objects / total heap after major GC |
| GC total pause budget | < 2%      | Baseline | Total GC time / wall clock time          |

### Worker Thread Benchmarking Tasks

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

## Native/WASM Module Performance Benchmarks

Benchmarks for the native module system (`epic-precompiled-hot-binaries`).
Measures the performance delta between native FFI, WASM, and pure-JS fallbacks.

### Module Comparison Targets

| Module             | Native (FFI) | WASM    | Pure-JS Fallback | Target Delta   |
| ------------------ | ------------ | ------- | ---------------- | -------------- |
| SHA-256 (1 MB)     | < 1ms        | < 3ms   | < 10ms           | Native 10x JS  |
| AES-256-GCM (1 MB) | < 1ms        | < 4ms   | < 15ms           | Native 10x JS  |
| gzip (1 MB)        | < 5ms        | < 15ms  | < 50ms           | Native 5x JS   |
| brotli (1 MB)      | < 10ms       | < 30ms  | < 100ms          | Native 5x JS   |
| zstd (1 MB)        | < 2ms        | < 8ms   | N/A              | Native 4x WASM |
| Image resize       | < 10ms       | < 50ms  | < 200ms          | Native 10x JS  |
| Thumbnail gen      | < 15ms       | < 80ms  | < 300ms          | Native 10x JS  |
| Embedding gen      | < 50ms       | < 200ms | < 1,000ms        | Native 10x JS  |

### Module Loading and Initialization

| Metric                     | Target   | Tier     | Notes                                   |
| -------------------------- | -------- | -------- | --------------------------------------- |
| Native module load (cold)  | < 50ms   | Baseline | First dlopen call                       |
| Native module load (warm)  | < 1ms    | Baseline | Subsequent loads, shared lib cached     |
| WASM module compile (cold) | < 200ms  | Baseline | WebAssembly.compile()                   |
| WASM module instantiate    | < 10ms   | Baseline | WebAssembly.instantiate()               |
| FFI call overhead          | < 0.01ms | Baseline | Single FFI call boundary                |
| WASM call overhead         | < 0.05ms | Baseline | Single WASM call boundary               |
| Module fallback detection  | < 1ms    | Baseline | Auto-detect: native, then WASM, then JS |

### Module Benchmarking Tasks

- [ ] Benchmark SHA-256: native FFI vs WASM vs pure-JS (Web Crypto)
- [ ] Benchmark AES-256-GCM: native FFI vs WASM vs pure-JS
- [ ] Benchmark gzip/brotli/zstd: native FFI vs WASM vs pure-JS (fflate)
- [ ] Benchmark image resize: native FFI (libvips) vs WASM vs canvas API
- [ ] Benchmark thumbnail generation: native vs WASM vs canvas API
- [ ] Benchmark embedding generation: native ONNX vs WASM vs transformers.js
- [ ] Benchmark module load times: cold/warm across all three modes
- [ ] Benchmark FFI vs WASM call overhead (1K, 10K, 100K calls)
- [ ] Benchmark hot-reload: native module swap time under load
- [ ] Benchmark fallback chain: auto-detect overhead in practice
- [ ] Benchmark concurrent module access: thread safety under load

## Per-Component Memory Profiling Targets

Per-component memory tracking with heap, RSS, and GC pressure targets.

### Component Memory Budgets

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

### Memory Profiling Metrics

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

### GC Pause Budget by Component

| Component                 | Minor GC Budget | Major GC Budget | Notes                              |
| ------------------------- | --------------- | --------------- | ---------------------------------- |
| HTTP request handler      | < 2ms           | < 10ms          | Must not stall request processing  |
| WebSocket message handler | < 1ms           | < 5ms           | Must not stall message dispatch    |
| DB query handler          | < 1ms           | < 5ms           | Must not stall connection pool     |
| Asset pipeline            | < 5ms           | < 20ms          | Longer budget, non-blocking path   |
| LLM streaming             | < 2ms           | < 10ms          | Must not stall token streaming     |
| Worker thread             | < 5ms           | < 20ms          | Isolated, no impact on main thread |

### Memory Profiling Tasks

- [ ] Implement per-component memory tracking (heap, RSS, external)
- [ ] Add GC pause measurement per request handler
- [ ] Add memory leak detection: long-running endurance tests

---

## Fuzzing Input Generation Strategy

**Spec**: `docs/spec/fuzzing-input-generation.md`

### Overview
Systematic approach to generating diverse, malicious, and edge-case inputs for fuzzing all external interfaces.

### Input Categories

| Category | Targets | Strategy | Priority |
|----------|---------|----------|----------|
| Structured Data (JSON/MessagePack/Protobuf) | REST endpoints, WebSocket messages, IPC | Type-aware mutation, schema violation, encoding attacks | P0 |
| Text/Protocol | Chat messages, LLM prompts, command parsers, regex extractors | Grammar-based fuzzing, injection payloads, unicode edge cases | P0 |
| Binary/Asset | Image upload, audio/video, file metadata extraction | Format corruption, polyglot files, ZIP bombs, decompression bombs | P0 |
| Network/Transport | HTTP/1.1, HTTP/2, WebSocket, raw TCP | Protocol violations, state machine attacks, slowloris patterns | P1 |
| Cryptographic Input | Key exchange, encryption/decryption, signature verification | Invalid curve points, weak keys, ciphertext manipulation | P1 |

### Generation Pipeline
```
Schema/Grammar ──▶ Base Corpus ──▶ Mutation Engine ──▶ Validation & Filter
     (from OpenAPI specs, valid traffic, unit test seeds)
```

### Mutation Strategies
1. **Bitflip** (deterministic): Flip 1-4 bits at byte offsets targeting headers, length fields, magic bytes
2. **Arithmetic** (deterministic): Add/subtract to 8/16/32-bit integers targeting length fields, counts, IDs
3. **Dictionary** (seeded): Known-bad strings from CVE databases, bug reports, project-specific config keys
4. **Structure-Aware** (smart): JSON key insertion/deletion, Protobuf field tag corruption, image chunk reorder
5. **Cross-Over** (recombination): Splice fragments from 2+ valid inputs at structure boundaries
6. **Generative** (grammar/schema): Random valid generation from schema with targeted constraint violations

### Coverage-Driven Prioritization
- **P0**: Auth endpoints (40% budget) — structure + dictionary + crypto fuzzing
- **P0**: Asset upload (25% budget) — binary + structure + polyglot fuzzing
- **P1**: Chat/message (15% budget) — grammar + injection + unicode fuzzing
- **P1**: LLM prompt (10% budget) — injection + unicode + length fuzzing
- **P2**: Admin/config (5% budget) — structure + dictionary + auth bypass
- **P2**: Internal IPC (5% budget) — structure + bitflip + arithmetic

### Fuzzing Harness Requirements
- Deterministic initialization (fixed seeds, mock time)
- No external dependencies (mock DB, cache, LLM)
- Fast reset (< 10ms per iteration)
- Memory leak detection (heap snapshot diff)
- Coverage instrumentation (source-map aware)
- Crash deduplication (stack trace + input hash)
- Timeout handling (per-iteration budget: 1s)
- OOM handling (memory limit: 512MB)

### Execution Infrastructure
- **Local**: `bun run fuzz:target --target=<name> --iterations=10000`
- **CI**: GitHub Actions matrix per target, 30m timeout, artifact upload on crash
- **Continuous**: Scheduler distributes targets across workers, centralized corpus sync, auto crash triage

### Deliverables
- [ ] Fuzzing infrastructure (harness runner, corpus manager, crash deduplicator)
- [ ] Per-target harnesses (auth, asset, chat, llm, admin, IPC)
- [ ] Seed corpora (10k+ seeds per target)
- [ ] Mutation engine (bitflip, arithmetic, dictionary, structure, crossover, generative)
- [ ] CI integration (GitHub Actions + artifact upload)
- [ ] Continuous fuzzing cluster (scheduler, corpus sync, crash triage)
- [ ] Dashboard integration (coverage, crashes, corpus, performance, ROI)
- [ ] Sanitizer integration (ASan, MSan, UBSan, TSan)
- [ ] Regression process (classification, minimization, fix verification)

---

## Performance Dashboard

**Spec**: `docs/spec/performance-dashboard.md`

### Overview
Real-time observability dashboard combining benchmarking results, live telemetry, and historical trends.

### Dashboard Panels

| Panel | Metric | Target | Refresh |
|-------|--------|--------|---------|
| **1. API Latency Heatmap** | `http_request_duration_seconds` (p50/p95/p99) | p99 < 5ms (non-LLM) | 10s |
| **2. Throughput Chart** | `http_requests_total`, `message_throughput_msgs_per_sec` | > 500 msg/s baseline | 10s |
| **3. Resource Utilization** | CPU, Memory (RSS/heap), GC pauses, Worker pool | RSS < 200MB peak | 10s |
| **4. LLM Generation Stats** | `llm_round_trip_seconds`, `llm_token_generation_rate` | p95 < 5s, > 20 tokens/s | 10s |
| **5. Concurrency Matrix** | Active connections, sessions, worker count | 10k concurrent target | 10s |
| **6. Error Budget Burn-down** | SLO violations, error budget remaining | Budget > 0% | 10s |

### SLO Tracking
- **Baseline SLOs**: API p50 < 20ms, p95 < 50ms, p99 < 200ms; Hot-path p99 < 5ms
- **LLM SLOs**: Round-trip p95 < 5s, p99 < 15s, Token rate > 20/s
- **Throughput SLOs**: Message throughput > 500 msg/s, Asset upload > 50 MB/s
- **Resource SLOs**: RSS at idle < 60MB, RSS at peak < 500MB, GC major pause p99 < 20ms
- **Worker Thread SLOs**: Spawn overhead < 5ms, IPC throughput > 10k msg/s

### Alerting Categories
1. **Performance Degradation**: Latency exceeds threshold → Slack #alerts-warning
2. **Capacity Exhaustion**: Approaching resource limits → Slack #alerts-warning
3. **SLO Violation**: Error budget burning too fast → Slack #alerts-critical + page
4. **System Failure**: Process crash, OOM, unresponsive → Slack #alerts-critical + page

### API Endpoints
- `GET /perf/metrics/live` — Real-time metrics (latency, throughput, resources, concurrency, SLO status)
- `GET /perf/metrics/benchmark` — Benchmark results with regression detection
- `GET /perf/slo/status` — SLO compliance and error budget status
- `GET /perf/dashboard/config` — Dashboard panel configuration

### Deliverables
- [ ] Live metrics collection (Prometheus-compatible endpoints)
- [ ] SLO compliance tracking system
- [ ] Error budget burn-down calculation
- [ ] Real-time dashboard UI (htmx + Alpine.js)
- [ ] Historical benchmark storage (SQLite)
- [ ] Regression detection system
- [ ] Alerting engine (threshold-based with routing)
- [ ] API endpoints for all dashboard data
- [ ] Configuration management for SLOs and thresholds
- [ ] Documentation (runbook, SLO definitions, alert playbooks)
- [ ] Add memory reclamation measurement after load drop
- [ ] Add per-component heap snapshot diffing
- [ ] Add RSS tracking over time (memory growth rate)
- [ ] Add external memory tracking (ArrayBuffer, TypedArray)
- [ ] Add GC pressure dashboard (minor/major pause distribution)
- [ ] Add memory regression detection in CI (per-component)
- [ ] Benchmark Worker thread memory isolation under load
- [ ] Benchmark native module memory footprint vs JS equivalent
- [ ] Add memory profiling to asset pipeline (peak allocation tracking)

## CI-Integrated Performance Regression Detection

### Benchmark Runner

Benchmarks run on every PR via GitHub Actions, comparing against the baseline
(main branch). Results stored as artifacts for historical analysis.

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

### Regression Thresholds

| Metric             | Regression Threshold | Action on PR |
| ------------------ | -------------------- | ------------ |
| API p95 latency    | > 10% increase       | Block merge  |
| API p99 latency    | > 15% increase       | Block merge  |
| Message throughput | > 5% decrease        | Block merge  |
| Memory usage       | > 10% increase       | Block merge  |
| CPU usage          | > 15% increase       | Block merge  |
| DB query p95       | > 10% increase       | Block merge  |

### Benchmark Configuration

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

### Implementation Tasks

- [ ] Define benchmark suite structure (`tests/benchmarks/`)
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

## Design

### Test Framework

```typescript
interface TestFramework {
  // Unit tests
  unit: UnitTestFramework;

  // Integration tests
  integration: IntegrationTestFramework;

  // E2E tests
  e2e: E2ETestFramework;

  // Performance tests
  performance: PerformanceTestFramework;

  // Security tests
  security: SecurityTestFramework;
}

interface UnitTestFramework {
  // Test runner
  runner: TestRunner;

  // Test utilities
  utilities: TestUtilities;

  // Mocking
  mocking: MockingFramework;

  // Coverage
  coverage: CoverageFramework;

  // Assertions
  assertions: AssertionFramework;
}

interface IntegrationTestFramework {
  // Service testing
  service: ServiceTestFramework;

  // API testing
  api: APITestFramework;

  // Database testing
  database: DatabaseTestFramework;

  // External service testing
  external: ExternalTestFramework;
}

interface E2ETestFramework {
  // Browser testing
  browser: BrowserTestFramework;

  // Mobile testing
  mobile: MobileTestFramework;

  // Desktop testing
  desktop: DesktopTestFramework;

  // Cross-platform testing
  crossPlatform: CrossPlatformTestFramework;
}

interface PerformanceTestFramework {
  // Benchmarking
  benchmark: BenchmarkFramework;

  // Profiling
  profile: ProfileFramework;

  // Load testing
  load: LoadTestFramework;

  // Stress testing
  stress: StressTestFramework;

  // Fuzzing
  fuzz: FuzzTestFramework;
}

interface SecurityTestFramework {
  // Vulnerability scanning
  vulnerability: VulnerabilityScanner;

  // Penetration testing
  penetration: PenetrationTester;

  // Security auditing
  audit: SecurityAuditor;

  // Compliance testing
  compliance: ComplianceTester;
}
```

### Benchmark Framework

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

### Profiling Framework

```typescript
interface ProfileFramework {
  // CPU profiling
  cpu: CPUProfiler;

  // Memory profiling
  memory: MemoryProfiler;

  // I/O profiling
  io: IOProfiler;

  // Network profiling
  network: NetworkProfiler;

  // Database profiling
  database: DatabaseProfiler;
}

interface CPUProfiler {
  // Start profiling
  start(): void;

  // Stop profiling
  stop(): Promise<CPUProfile>;

  // Get profile
  getProfile(): CPUProfile;

  // Analyze profile
  analyze(profile: CPUProfile,): CPUProfileAnalysis;
}

interface CPUProfile {
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  samples: CPUSample[];
  functions: CPUFunction[];
  calls: CPUCall[];
}

interface CPUSample {
  timestamp: number;
  cpu: number;
  pid: number;
  tid: number;
  functionName: string;
  functionId: number;
  lineNumber: number;
  columnNumber: number;
}

interface CPUFunction {
  id: number;
  name: string;
  scriptName: string;
  lineNumber: number;
  columnNumber: number;
  totalTime: number;
  selfTime: number;
  calls: number;
  percentage: number;
}

interface CPUProfileAnalysis {
  hotspots: CPUHotspot[];
  bottlenecks: CPUBottleneck[];
  recommendations: CPURecommendation[];
  summary: CPUProfileSummary;
}

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

### Load Testing Framework

```typescript
interface LoadTestFramework {
  // Run load test
  run(config: LoadTestConfig,): Promise<LoadTestResult>;

  // Run stress test
  runStress(config: StressTestConfig,): Promise<StressTestResult>;

  // Run spike test
  runSpike(config: SpikeTestConfig,): Promise<SpikeTestResult>;

  // Run endurance test
  runEndurance(config: EnduranceTestConfig,): Promise<EnduranceTestResult>;
}

interface LoadTestConfig {
  id: string;
  name: string;
  target: string;
  duration: number; // seconds
  virtualUsers: number;
  rampUp: number; // seconds
  scenarios: LoadTestScenario[];
  thresholds: LoadTestThreshold[];
}

interface LoadTestScenario {
  id: string;
  name: string;
  weight: number; // percentage
  steps: LoadTestStep[];
}

interface LoadTestStep {
  id: string;
  name: string;
  action: string;
  parameters: Record<string, unknown>;
  thinkTime: number; // milliseconds
  assertions: LoadTestAssertion[];
}

interface LoadTestResult {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  virtualUsers: number;
  requests: LoadTestRequestResult[];
  metrics: LoadTestMetrics;
  thresholds: LoadTestThresholdResult[];
  errors: LoadTestError[];
}

interface LoadTestRequestResult {
  id: string;
  name: string;
  method: string;
  url: string;
  status: number;
  responseTime: number;
  latency: number;
  throughput: number;
  errors: number;
}

interface LoadTestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p50ResponseTime: number;
  p90ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  requestsPerSecond: number;
  bytesPerSecond: number;
  averageLatency: number;
  errorRate: number;
}
```

### Fuzzing Framework

```typescript
interface FuzzTestFramework {
  // Run fuzz test
  run(config: FuzzTestConfig,): Promise<FuzzTestResult>;

  // Run mutation fuzzing
  runMutation(config: MutationFuzzConfig,): Promise<MutationFuzzResult>;

  // Run generation fuzzing
  runGeneration(config: GenerationFuzzConfig,): Promise<GenerationFuzzResult>;

  // Run coverage-guided fuzzing
  runCoverageGuided(config: CoverageGuidedFuzzConfig,): Promise<CoverageGuidedFuzzResult>;
}

interface FuzzTestConfig {
  id: string;
  name: string;
  target: string;
  duration: number; // seconds
  iterations: number;
  seed: number;
  corpus: FuzzCorpus[];
  mutators: FuzzMutator[];
  dictionaries: FuzzDictionary[];
  coverage: boolean;
}

interface FuzzCorpus {
  id: string;
  name: string;
  type: "file" | "directory" | "url" | "string";
  content: string | Buffer;
  weight: number;
}

interface FuzzMutator {
  id: string;
  name: string;
  type: "bitflip" | "byteflip" | "arithmetic" | "interesting" | "havoc" | "splice";
  probability: number;
}

interface FuzzDictionary {
  id: string;
  name: string;
  words: string[];
  patterns: string[];
}

interface FuzzTestResult {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  iterations: number;
  coverage: FuzzCoverage;
  crashes: FuzzCrash[];
  hangs: FuzzHang[];
  uniqueCrashes: number;
  uniqueHangs: number;
  corpusSize: number;
  corpusGrowth: number;
}

interface FuzzCoverage {
  edges: number;
  newEdges: number;
  totalEdges: number;
  percentage: number;
  functions: number;
  newFunctions: number;
  totalFunctions: number;
}

interface FuzzCrash {
  id: string;
  type: string;
  input: Buffer;
  stack: string;
  severity: "low" | "medium" | "high" | "critical";
  reproducible: boolean;
  count: number;
}

interface FuzzHang {
  id: string;
  input: Buffer;
  duration: number;
  stack: string;
  reproducible: boolean;
  count: number;
}
```

### Security Testing Framework

```typescript
interface SecurityTestFramework {
  // Run vulnerability scan
  runVulnerabilityScan(config: VulnerabilityScanConfig,): Promise<VulnerabilityScanResult>;

  // Run penetration test
  runPenetrationTest(config: PenetrationTestConfig,): Promise<PenetrationTestResult>;

  // Run security audit
  runSecurityAudit(config: SecurityAuditConfig,): Promise<SecurityAuditResult>;

  // Run compliance test
  runComplianceTest(config: ComplianceTestConfig,): Promise<ComplianceTestResult>;
}

interface VulnerabilityScanConfig {
  id: string;
  name: string;
  target: string;
  type: "network" | "web" | "api" | "database" | "application";
  depth: number;
  timeout: number;
  credentials: Credentials[];
  excludePatterns: string[];
}

interface VulnerabilityScanResult {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  vulnerabilities: Vulnerability[];
  summary: VulnerabilitySummary;
  recommendations: SecurityRecommendation[];
}

interface Vulnerability {
  id: string;
  name: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  location: string;
  evidence: string;
  remediation: string;
  cvss: number;
  cve: string;
}

interface PenetrationTestConfig {
  id: string;
  name: string;
  target: string;
  scope: string[];
  methodology: string;
  tools: string[];
  credentials: Credentials[];
  rules: PenetrationRule[];
}

interface PenetrationTestResult {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  findings: PenetrationFinding[];
  exploits: PenetrationExploit[];
  summary: PenetrationSummary;
  recommendations: SecurityRecommendation[];
}

interface PenetrationFinding {
  id: string;
  name: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  location: string;
  evidence: string;
  impact: string;
  remediation: string;
}

interface SecurityAuditConfig {
  id: string;
  name: string;
  target: string;
  scope: string[];
  standards: string[];
  checks: SecurityCheck[];
  credentials: Credentials[];
}

interface SecurityAuditResult {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  findings: SecurityFinding[];
  compliance: ComplianceStatus;
  summary: SecuritySummary;
  recommendations: SecurityRecommendation[];
}
```

## Test Categories

### Round-Trip Request Tests

- HTTP request/response round-trips
- WebSocket message round-trips
- API endpoint round-trips
- Database query round-trips
- External service round-trips
- LLM request round-trips (heavy)

### Chat Performance Tests

- User-to-user chat throughput
- Group chat throughput
- Message ordering and delivery
- Concurrent user handling
- Message persistence
- Message retrieval

### Asset Performance Tests

- Asset upload throughput
- Asset storage performance
- Asset retrieval performance
- Asset transformation performance
- Asset deletion performance
- Asset metadata operations

### Application Performance Tests

- Frontend load time
- Frontend rendering performance
- Frontend interaction performance
- Backend API response time
- Backend throughput
- Database query performance
- Network latency
- Memory usage
- CPU usage

### Pressure & Fuzzing Tests

- Load testing (100, 1000, 10000 concurrent users)
- Stress testing (beyond capacity)
- Spike testing (sudden load increases)
- Endurance testing (24h+ sustained load)
- Fuzz testing (random/malformed inputs)
- Chaos engineering (failure injection)

### Bottleneck Detection Tests

- CPU profiling
- Memory profiling
- I/O profiling
- Network profiling
- Database profiling
- Application profiling

### Pattern Application Tests

- Good practices vs. performance impact
- Code pattern benchmarking
- Architecture pattern benchmarking
- Design pattern benchmarking
- Refactoring impact analysis
- Technical debt measurement

### Security Tests

- Authentication performance
- Authorization performance
- Encryption performance
- Input validation performance
- Rate limiting performance
- Security vs. performance trade-offs

## Tasks

- [ ] Design testing framework architecture
- [ ] Implement unit test framework
- [ ] Implement integration test framework
- [ ] Implement E2E test framework
- [ ] Implement performance test framework
- [ ] Implement benchmark framework
- [ ] Implement profiling framework (CPU, memory, I/O, network, database)
- [ ] Implement load testing framework
- [ ] Implement stress testing framework
- [ ] Implement spike testing framework
- [ ] Implement endurance testing framework
- [ ] Implement fuzzing framework
- [ ] Implement security testing framework
- [ ] Implement vulnerability scanning
- [ ] Implement penetration testing
- [ ] Implement security auditing
- [ ] Implement compliance testing
- [ ] Implement bottleneck detection
- [ ] Implement pattern application testing
- [ ] Create test reporting
- [ ] Create test dashboards
- [ ] Create test automation
- [ ] Write tests for testing framework

## Files

- `tests/` — test directory (expand existing)
- `tests/unit/` — unit tests
- `tests/integration/` — integration tests
- `tests/e2e/` — E2E tests
- `tests/performance/` — performance tests
- `tests/benchmarks/` — benchmarks
- `tests/security/` — security tests
- `tests/fuzz/` — fuzz tests
- `tests/fixtures/` — test fixtures
- `tests/mocks/` — test mocks
- `tests/utils/` — test utilities
- `src/benchmarks/` — benchmark framework
- `src/profiling/` — profiling framework
- `src/security-tests/` — security test framework
- `docs/testing/` — testing documentation

## Open Questions

### Round-Trip Testing

- How to handle heavy LLM round-trips?
- Should round-trips be tested in isolation or together?
- How to measure round-trip accuracy?
- Should round-trips be tested with real or mock data?

### Chat Performance

- How many concurrent users should be tested?
- Should chat tests include media messages?
- How to test chat reliability?
- Should chat tests include history retrieval?

### Asset Performance

- How large should test assets be?
- Should asset tests include transformations?
- How to test asset storage scalability?
- Should asset tests include CDN performance?

### Application Performance

- What are acceptable performance thresholds?
- Should performance tests run on every commit?
- How to test performance across different environments?
- Should performance tests include mobile devices?

### Pressure & Fuzzing

- How long should endurance tests run?
- What mutation strategies are most effective?
- How to handle false positives in fuzzing?
- Should fuzzing include security-focused mutations?

### Bottleneck Detection

- How to identify root causes of bottlenecks?
- Should bottleneck detection be automated?
- How to prioritize bottleneck fixes?
- Should bottleneck detection include historical analysis?

### Pattern Application

- How to measure the impact of good practices?
- Should pattern benchmarks be standardized?
- How to handle trade-offs between patterns?
- Should pattern benchmarks include real-world scenarios?

### Security Testing

- How to balance security and performance?
- Should security tests be run on every commit?
- How to handle security test false positives?
- Should security tests include compliance checking?

## Implementation Phases

### Phase 1: Core Testing Framework

- Unit test framework
- Integration test framework
- Test utilities and mocks
- Test coverage

### Phase 2: E2E Testing Framework

- Browser testing
- Mobile testing
- Desktop testing
- Cross-platform testing

### Phase 3: Performance Testing Framework

- Benchmark framework
- Profiling framework
- Load testing framework
- Stress testing framework

### Phase 4: Advanced Testing

- Fuzzing framework
- Chaos engineering
- Spike testing
- Endurance testing

### Phase 5: Security Testing

- Vulnerability scanning
- Penetration testing
- Security auditing
- Compliance testing

### Phase 6: Analysis & Reporting

- Bottleneck detection
- Pattern application testing
- Test reporting
- Test dashboards

## Linked Tasks

- TASK-testing-benchmarking.md
