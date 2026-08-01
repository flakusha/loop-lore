# Performance Dashboard Specification

## Overview
Real-time observability dashboard for system performance metrics, combining benchmarking results, live telemetry, and historical trends.

---

## Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Performance Dashboard                     │
├─────────────────────────────────────────────────────────────┤
│  Real-time Metrics  │  Historical Trends  │  Alerts/SLOs    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [1] API Latency Heatmap   │  [2] Throughput Chart           │
│  [3] Resource Utilization │  [4] LLM Generation Stats       │
│  [5] Concurrency Matrix   │  [6] Error Budget Burn-down    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Sources
- **Live**: Prometheus metrics from running instances
- **Benchmark**: Results from `docs/spec/benchmarking.md` test suites
- **Logs**: Bun runtime metrics, GC stats, V8 heap snapshots
- **DB**: Query performance from Kysely instrumentation
- **External**: LLM provider response times, asset processing durations

### Stack
```
Frontend: htmx + Alpine.js (existing stack)
Backend: Elysia.js endpoints serving metric data
Storage: Prometheus (live) + SQLite (historical aggregates)
Alerting: Bun-native, threshold-based with hysteresis
```

---

## Panel Specifications

### Panel 1: API Latency Heatmap
**Purpose**: Identify slow endpoints at a glance

**Metrics**:
- `http_request_duration_seconds` (histogram, p50/p95/p99)
- Per-endpoint breakdown (route template, not path)
- Color-coded by SLO threshold (green < 1ms, yellow < 5ms, red > 5ms)

**Display**:
- Grid: X-axis = routes, Y-axis = latency percentiles
- Hover: Full distribution, request count, error rate
- Click: Drill-down to time-series for that route

**Refresh**: 10s for live, manual for benchmark mode

### Panel 2: Throughput Chart
**Purpose**: Track request volume and message throughput

**Metrics**:
- `http_requests_total` (counter, per route)
- `websocket_messages_total` (counter, direction)
- `message_throughput_msgs_per_sec` (gauge)
- `asset_upload_throughput_mb_per_sec` (gauge)

**Display**:
- Time-series line chart (last 60 min)
- Overlay: Target throughput (500 msg/s baseline, 5000 msg/s high)
- Shaded regions: Confidence intervals from benchmarking runs

### Panel 3: Resource Utilization
**Purpose**: Monitor system resource consumption

**Metrics**:
- CPU: `process_cpu_seconds_total`, event loop lag
- Memory: RSS, heap used, external memory, ArrayBuffer
- GC: Pause duration (minor/major), heap growth rate, live ratio
- Workers: Count, memory per worker, IPC throughput

**Display**:
- Multi-axis chart: CPU% (left), Memory MB (right)
- GC pause timeline: Vertical bars on latency chart
- Worker pool grid: Status, load, memory per worker
- Budget indicators: Memory < 200MB peak, CPU < 1 core per 100 sessions

### Panel 4: LLM Generation Stats
**Purpose**: Track LLM-dependent operation performance

**Metrics**:
- `llm_round_trip_seconds` (histogram, p50/p95/p99)
- `llm_token_generation_rate` (tokens/sec)
- `llm_queue_depth` (gauge)
- `llm_cancellation_rate` (counter)

**Display**:
- Latency distribution histogram
- Token rate over time (target: > 20 tokens/sec)
- Queue depth with backpressure indicator
- SLO overlay: p95 < 5s, p99 < 15s

### Panel 5: Concurrency Matrix
**Purpose**: Validate concurrent user handling

**Metrics**:
- `active_connections` (gauge)
- `concurrent_sessions` (gauge)
- `websocket_active_sessions` (gauge)
- `worker_thread_count` (gauge)

**Display**:
- Real-time counter with tier indicators (Smoke/Light/Medium/Heavy)
- Capacity bar: Current vs target (10k concurrent)
- Connection state breakdown: Active/Pending/Closing
- Worker utilization heatmap

### Panel 6: Error Budget Burn-down
**Purpose**: Track SLO compliance and error budget consumption

**Metrics**:
- `slo_violations_total` (counter, per SLO)
- `error_budget_remaining` (gauge, percentage)
- `sli_compliance_ratio` (gauge, 0-1)

**Display**:
- Burn-down chart: Error budget remaining over time
- SLO status grid: Green/Yellow/Red per SLO
- Alerting: Threshold breach notifications

---

## SLO Tracking

### Baseline SLOs (Non-LLM)
| Metric | Target | Alert Threshold | Alert Window |
|--------|--------|-----------------|--------------|
| API p50 latency | < 20ms | > 50ms | 5 min |
| API p95 latency | < 50ms | > 100ms | 5 min |
| API p99 latency | < 200ms | > 500ms | 5 min |
| Hot-path round-trip | < 1ms | > 5ms | 1 min |
| Hot-path p99 | < 5ms | > 20ms | 1 min |
| Hot-path p99.9 | < 20ms | > 50ms | 1 min |

### LLM SLOs
| Metric | Target | Alert Threshold | Alert Window |
|--------|--------|-----------------|--------------|
| Round-trip p95 | < 5s | > 10s | 10 min |
| Round-trip p99 | < 15s | > 30s | 10 min |
| Token rate | > 20/s | < 10/s | 5 min |

### Throughput SLOs
| Metric | Target | Alert Threshold | Alert Window |
|--------|--------|-----------------|--------------|
| Message throughput | > 500 msg/s | < 200 msg/s | 5 min |
| Asset upload | > 50 MB/s | < 20 MB/s | 5 min |
| Concurrent users | 10k | < 1k | 1 min |

### Resource SLOs
| Metric | Target | Alert Threshold | Alert Window |
|--------|--------|-----------------|--------------|
| RSS at idle | < 60MB | > 100MB | 5 min |
| RSS at peak | < 500MB | > 700MB | 5 min |
| GC major pause p99 | < 20ms | > 50ms | 1 min |
| Memory growth rate | < 1MB/min | > 5MB/min | 10 min |

### Worker Thread SLOs
| Metric | Target | Alert Threshold | Alert Window |
|--------|--------|-----------------|--------------|
| Worker spawn overhead | < 5ms | > 20ms | 1 min |
| Worker IPC throughput | > 10k msg/s | < 3k msg/s | 5 min |
| Worker memory (active) | < 100MB | > 200MB | 5 min |

---

## Alerting System

### Alert Categories
1. **Performance Degradation**: Latency exceeds threshold
2. **Capacity Exhaustion**: Approaching resource limits
3. **SLO Violation**: Error budget burning too fast
4. **System Failure**: Process crash, OOM, unresponsive

### Alert Routing
```
Severity: critical
  → Page on-call engineer
  → Slack #alerts-critical
  → Create incident ticket

Severity: warning
  → Slack #alerts-warning
  → Email summary (batched)

Severity: info
  → Log only
  → Dashboard annotation
```

### Alert Suppression
- Suppress during scheduled maintenance windows
- Suppress cascade alerts (if root cause is known)
- Auto-resolve: Alert clears when metric returns to normal for 5 min

---

## Benchmark Mode

### Features
- **Historical Comparison**: Compare current run vs baseline
- **Regression Detection**: Highlight SLO violations vs previous runs
- **Statistical Significance**: Show confidence intervals, p-values
- **Diff View**: Show changes in hot-path metrics between runs

### Data Display
- Side-by-side: Current vs Baseline
- Delta indicators: % change, absolute change
- Statistical annotations: "95% confidence, ±2ms"
- Regression flags: Auto-flag > 10% degradation

---

## API Endpoints

### Live Metrics
```
GET /perf/metrics/live
  Query: route, window (default: 60m)
  Returns: {
    latency: { p50, p95, p99, count },
    throughput: { req_per_sec, msg_per_sec },
    resources: { cpu, memory, gc },
    concurrency: { connections, sessions },
    slo_status: { compliant, budget_remaining }
  }
```

### Benchmark Results
```
GET /perf/metrics/benchmark
  Query: suite, run_id, compare_to
  Returns: {
    run_id, timestamp, suite,
    metrics: { ... },
    regression: { detected: boolean, details: [...] }
  }
```

### SLO Status
```
GET /perf/slo/status
  Returns: {
    slos: [
      { name, target, current, compliant, budget_remaining }
    ],
    alerts: [
      { severity, message, triggered_at, resolved }
    ]
  }
```

### Dashboard Config
```
GET /perf/dashboard/config
  Returns: {
    panels: [ { id, title, type, refresh_interval } ],
    slos: [ ... ],
    thresholds: { ... }
  }
```

---

## Implementation Roadmap

### Phase 1: Core Metrics
- [ ] Instrument Elysia routes with Prometheus-compatible metrics
- [ ] Collect V8 GC stats and memory usage
- [ ] Track WebSocket connection counts and message rates
- [ ] Build `/perf/metrics/live` endpoint

### Phase 2: SLO Tracking
- [ ] Define SLO thresholds (from table above)
- [ ] Implement SLO compliance calculator
- [ ] Add error budget tracking
- [ ] Build `/perf/slo/status` endpoint

### Phase 3: Dashboard UI
- [ ] Create htmx-based dashboard layout
- [ ] Implement Panel 1-3 (latency, throughput, resources)
- [ ] Add real-time polling (10s refresh)
- [ ] Add drill-down capabilities

### Phase 4: Benchmark Integration
- [ ] Store benchmark results in SQLite
- [ ] Implement benchmark mode in dashboard
- [ ] Add regression detection
- [ ] Build `/perf/metrics/benchmark` endpoint

### Phase 5: Alerting
- [ ] Implement threshold-based alerting
- [ ] Add alert routing (Slack, email)
- [ ] Add alert suppression
- [ ] Create incident ticket integration

### Phase 6: Advanced Features
- [ ] Add Panel 4-6 (LLM, concurrency, error budget)
- [ ] Implement statistical significance indicators
- [ ] Add historical comparison and diff views
- [ ] Build auto-regression detection

---

## Deliverables Checklist

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