<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Performance Dashboard & SLO Tracking

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** observability, slo, dashboard, alerting, prometheus
**Parent Epic:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md)

## Overview

Real-time observability dashboard combining benchmarking results, live telemetry, and historical trends.

**Spec**: `docs/spec/performance-dashboard.md`

## Sub-Epic of

Part of the **Testing, Benchmarking & Performance** epic. The parent hub remains the authoritative source for the shared Performance Targets & SLOs and Concurrent User Tiers tables this epic tracks compliance against.

## Dashboard Panels

| Panel                         | Metric                                                   | Target                  | Refresh |
| ----------------------------- | -------------------------------------------------------- | ----------------------- | ------- |
| **1. API Latency Heatmap**    | `http_request_duration_seconds` (p50/p95/p99)            | p99 < 5ms (non-LLM)     | 10s     |
| **2. Throughput Chart**       | `http_requests_total`, `message_throughput_msgs_per_sec` | > 500 msg/s baseline    | 10s     |
| **3. Resource Utilization**   | CPU, Memory (RSS/heap), GC pauses, Worker pool           | RSS < 200MB peak        | 10s     |
| **4. LLM Generation Stats**   | `llm_round_trip_seconds`, `llm_token_generation_rate`    | p95 < 5s, > 20 tokens/s | 10s     |
| **5. Concurrency Matrix**     | Active connections, sessions, worker count               | 10k concurrent target   | 10s     |
| **6. Error Budget Burn-down** | SLO violations, error budget remaining                   | Budget > 0%             | 10s     |

## SLO Tracking

- **Baseline SLOs**: API p50 < 20ms, p95 < 50ms, p99 < 200ms; Hot-path p99 < 5ms
- **LLM SLOs**: Round-trip p95 < 5s, p99 < 15s, Token rate > 20/s
- **Throughput SLOs**: Message throughput > 500 msg/s, Asset upload > 50 MB/s
- **Resource SLOs**: RSS at idle < 60MB, RSS at peak < 500MB, GC major pause p99 < 20ms
- **Worker Thread SLOs**: Spawn overhead < 5ms, IPC throughput > 10k msg/s

## Alerting Categories

1. **Performance Degradation**: Latency exceeds threshold → Slack #alerts-warning
2. **Capacity Exhaustion**: Approaching resource limits → Slack #alerts-warning
3. **SLO Violation**: Error budget burning too fast → Slack #alerts-critical + page
4. **System Failure**: Process crash, OOM, unresponsive → Slack #alerts-critical + page

## API Endpoints

- `GET /perf/metrics/live` — Real-time metrics (latency, throughput, resources, concurrency, SLO status)
- `GET /perf/metrics/benchmark` — Benchmark results with regression detection
- `GET /perf/slo/status` — SLO compliance and error budget status
- `GET /perf/dashboard/config` — Dashboard panel configuration

## Tasks

- [ ] Live metrics collection (Prometheus-compatible endpoints)
- [ ] Implement Prometheus exposition endpoint (`/metrics`) with http/message/LLM/resource counters
- [ ] SLO compliance tracking system
- [ ] Error budget burn-down calculation
- [ ] Real-time dashboard UI (htmx + Alpine.js)
- [ ] Historical benchmark storage (SQLite)
- [ ] Regression detection system
- [ ] Alerting engine (threshold-based with routing)
- [ ] Define alert routing rules per alerting category (warning vs critical + paging)
- [ ] API endpoints for all dashboard data
- [ ] Configuration management for SLOs and thresholds
- [ ] Documentation (runbook, SLO definitions, alert playbooks)
- [ ] Implement API latency heatmap panel (p50/p95/p99)
- [ ] Implement throughput chart panel (requests + messages per second)
- [ ] Implement resource utilization panel (CPU, RSS/heap, GC pauses, worker pool)
- [ ] Implement LLM generation stats panel (round-trip latency, token rate)
- [ ] Implement concurrency matrix panel (connections, sessions, workers)
- [ ] Implement error budget burn-down panel
- [ ] Wire benchmark epic results into `/perf/metrics/benchmark` for regression display

## Dependencies

- **Parent hub:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md) — shared SLO/target tables.
- **Siblings (data sources):** Benchmark CI & Performance Regression Detection (epic-benchmark-ci-regression.md) produces stored results; Concurrency & Runtime Benchmarks (epic-concurrency-runtime-benchmarks.md) supplies worker/GC telemetry; Native/WASM Module Performance Benchmarks (epic-native-module-benchmarks.md) supplies module metrics; Memory Profiling & Budgets (epic-memory-profiling-budgets.md) supplies GC-pressure and RSS series; Fuzzing Infrastructure (epic-fuzzing-infrastructure.md) supplies fuzzing dashboard panels.
- Build the dashboard data model only after at least one upstream benchmark epic has produced stored results; metric collection can start independently.

## Files

- `src/benchmarks/` — result storage + regression detection integration
- `docs/testing/` — runbooks, SLO definitions, alert playbooks
