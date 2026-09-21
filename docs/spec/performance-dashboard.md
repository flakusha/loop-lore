<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Performance Dashboard Specification

Status: Not implemented — no `/perf/*` endpoints or dashboard code exist in `src/`. Owned by an epic; all its tasks are open.

## Implemented

- Nothing yet. Planned data sources (live Prometheus-style metrics, benchmark results, SQLite aggregates) have no code.

## Not implemented / aspirational (design content, compressed)

- Panels: API latency heatmap (p50/p95/p99 per route template), throughput chart (500 msg/s baseline), resource utilization (CPU/RSS/heap/GC/workers), LLM generation stats (round-trip, token rate, queue depth), concurrency matrix (10k target), error-budget burn-down.
- SLO targets with alert thresholds + windows: API p50 < 20ms (> 50ms, 5min), p95 < 50ms (> 100ms, 5min), p99 < 200ms (> 500ms, 5min); hot-path p99 < 5ms (> 20ms, 1min), p99.9 < 20ms; LLM round-trip p95 < 5s / p99 < 15s, token rate > 20/s (alert < 10/s, 5min); throughput > 500 msg/s, assets > 50 MB/s; RSS idle < 60MB / peak < 500MB; GC major pause p99 < 20ms; worker spawn < 5ms, IPC > 10k msg/s.
- Alerting: four categories (degradation, capacity exhaustion, SLO violation, system failure); critical → page + `#alerts-critical` + incident ticket, warning → `#alerts-warning` + batched email, info → log; suppress in maintenance windows and cascades; auto-resolve after 5min normal.
- Benchmark mode: current-vs-baseline diff view, confidence intervals, auto-flag > 10% regression.
- Endpoints: `GET /perf/metrics/live`, `GET /perf/metrics/benchmark`, `GET /perf/slo/status`, `GET /perf/dashboard/config`.
- Stack: htmx + Alpine.js frontend, Elysia metric endpoints, Prometheus (live) + SQLite (historical aggregates), Bun-native threshold alerting with hysteresis.

## Epics

- `.plan/epics/epic-performance-dashboard-slo.md` — owner (Not Started): panel table, SLO summary, Prometheus exposition endpoint task, full task list.
- Parent hub: `.plan/epics/epic-testing-benchmarking.md`; data-source siblings: `epic-benchmark-ci-regression.md`, `epic-concurrency-runtime-benchmarks.md`, `epic-native-module-benchmarks.md`, `epic-memory-profiling-budgets.md`, `epic-fuzzing-infrastructure.md`.
