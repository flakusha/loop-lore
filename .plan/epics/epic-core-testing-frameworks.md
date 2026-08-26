<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Core Testing Frameworks

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High
**Type:** Infrastructure Epic
**Tags:** testing, unit-testing, integration-testing, e2e, security
**Parent Epic:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md)

## Overview

Unit, integration, E2E, performance-load, and security test framework architecture for loop-lore.

## Sub-Epic of

Part of the **Testing, Benchmarking & Performance** epic. Benchmark-specific work lives in the sibling sub-epics (see Dependencies).

> **⚠️ VERIFY BEFORE EXECUTING:** Validate every task below against the
> already-shipped repo test setup (`bun test`, `tests/e2e`) before starting
> work — much of this may already exist. Do not re-implement what `bun test`
> and the existing `tests/e2e` harness already cover; scope new work to the
> gaps only.

## Scope

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

### Pressure Testing (non-fuzz)

- Load testing (high concurrent users)
- Stress testing (beyond capacity)
- Spike testing (sudden load increases)
- Endurance testing (sustained load)
- Chaos engineering (failure injection)

### Bottleneck Detection

- Performance profiling
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
```

The `BenchmarkFramework` is specified in Benchmark CI & Regression Detection
(epic-benchmark-ci-regression.md); `FuzzTestFramework` in Fuzzing
Infrastructure (epic-fuzzing-infrastructure.md); the memory side of
`ProfileFramework` in Memory Profiling & Budgets
(epic-memory-profiling-budgets.md).

### CPU Profiler (bottleneck detection)

```typescript
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

interface CPUProfileAnalysis {
  hotspots: CPUHotspot[];
  bottlenecks: CPUBottleneck[];
  recommendations: CPURecommendation[];
  summary: CPUProfileSummary;
}
```

The I/O, network, and database profilers follow the same shape as
`CPUProfiler` (start / stop / getProfile / analyze) with domain-specific
profile types.

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

### Security Testing Framework

```typescript
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

interface SecurityAuditConfig {
  id: string;
  target: string;
  scope: string[];
  standards: string[];
  checks: SecurityCheck[];
  credentials: Credentials[];
}
```

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

## Implementation Phases

1. **Core Testing Framework** — unit test framework, integration test framework, test utilities and mocks, test coverage.
2. **E2E Testing Framework** — browser, mobile, desktop, cross-platform testing.
3. **Performance Testing Framework** — benchmark, profiling, load, stress frameworks (benchmark details in epic-benchmark-ci-regression.md).
4. **Advanced Testing** — fuzzing (epic-fuzzing-infrastructure.md), chaos engineering, spike testing, endurance testing.
5. **Security Testing** — vulnerability scanning, penetration testing, security auditing, compliance testing.
6. **Analysis & Reporting** — bottleneck detection, pattern application testing, test reporting, test dashboards (dashboard UI in epic-performance-dashboard-slo.md).

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

## Files

- `tests/` — test directory (expand existing)
- `tests/unit/` — unit tests
- `tests/integration/` — integration tests
- `tests/e2e/` — E2E tests
- `tests/performance/` — performance tests
- `tests/security/` — security tests
- `tests/fixtures/` — test fixtures
- `tests/mocks/` — test mocks
- `tests/utils/` — test utilities
- `docs/testing/` — testing documentation

## Dependencies

- **Parent hub:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md) — shared targets/tiers tables.
- **Siblings:** Fuzzing Infrastructure (epic-fuzzing-infrastructure.md) owns the fuzz framework; Benchmark CI & Performance Regression Detection (epic-benchmark-ci-regression.md) owns the benchmark runner; Memory Profiling & Budgets (epic-memory-profiling-budgets.md) owns memory profiling; Performance Dashboard & SLO (epic-performance-dashboard-slo.md) owns reporting dashboards.
