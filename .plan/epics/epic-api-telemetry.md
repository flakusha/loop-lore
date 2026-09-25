<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: API Telemetry

**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** telemetry, metrics, tracing, prometheus, monitoring
**Parent Epic:** API Governance (epic-api-governance.md)

## Summary

API telemetry: metrics collector, latency tracking, error-rate monitoring,
distributed tracing, Prometheus export, and a monitoring dashboard. Enables
anomaly detection and operational visibility across all governed endpoints.

## Sub-Epic of

Part of the **API Governance** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- Metrics collector
- Latency tracking
- Error rate monitoring
- Distributed tracing
- Prometheus export (`/api/metrics`)
- Monitoring dashboard

## Design

### Metrics Collector

```typescript
import { MetricsCollector, } from "./telemetry/collector";

const metrics = new MetricsCollector({
  exportInterval: 15000, // 15 seconds
  destination: "prometheus", // or 'datadog', 'custom'
},);

// Track metrics
metrics.increment("api.requests.total",);
metrics.histogram("api.latency", latency,);
metrics.gauge("api.activeConnections", activeCount,);
```

### Distributed Tracing

```typescript
import { Tracer, } from "./telemetry/tracing";

const tracer = new Tracer({
  serviceName: "loop-lore",
  exporter: "jaeger", // or 'zipkin', 'otlp'
},);

// Create span
const span = tracer.startSpan("chat.create",);
try {
  // Do work
  span.setStatus({ code: SpanStatusCode.OK, },);
} finally {
  span.end();
}
```

| Metric     | Description                 |
| ---------- | --------------------------- |
| Latency    | Request/response time       |
| Errors     | Error rates by endpoint     |
| Throughput | Requests per second         |
| Tracing    | Distributed request tracing |

## Tasks

- [ ] Implement metrics collector
- [ ] Add latency tracking
- [ ] Create error rate monitoring
- [ ] Implement distributed tracing
- [ ] Add Prometheus export
- [ ] Build monitoring dashboard

## Dependencies

- Parent hub: **API Governance** (`epic-api-governance.md`) — owns the shared layout, the `/api/metrics` endpoint, and governance REST surface.
- Siblings: requires `epic-api-validation-guardrails.md` to land first; mutually independent with `epic-api-rate-limiting.md` and `epic-api-task-offloading.md` afterwards.

## Existing Groundwork (verified 2026-09-25)

- `src/routes/metrics.ts` — `GET /metrics` Prometheus text exposition, opt-in via `config.observability.metrics.enabled` (process gauges only; no secrets). Tests in `metrics.test.ts`.
- `src/config/schema*/observability.ts` — observability config section: liveness/readiness probes + metrics opt-in (`2e34de8`).
- Liveness/readiness endpoints (`7c8cf4b`).
- Remaining epic scope: HTTP metrics collector (per-route latency/error/throughput — the current endpoint exposes process gauges only), distributed tracing (evaluation open in `TASK-evaluate-elysia-opentelemetry*`), monitoring dashboard.

## Linked Tickets

| Ticket | Status | Scope |
| ------ | ------ | ----- |
| `TASK-rate-limiting-telemetry.md` | open | Governance umbrella for rate limiting + telemetry (issue `2e40125`) |
| `TASK-prometheus-metrics-endpoint-opt-in.md` | done | `/metrics` Prometheus endpoint (issue `8f695c2`) |
| `TASK-observability-config-section.md` | done | Observability config section (issue `2e34de8`) |
| `FEAT-liveness-readiness-endpoints-opt-in-config.md` | done | Liveness/readiness probes (issue `7c8cf4b`) |
| `TASK-observability-telemetry-analytics.md` | open | Broader observability/analytics surface (epic-analytics-observability) |

## Files

- `src/api-governance/telemetry/collector.ts` — Telemetry collector
- `src/api-governance/telemetry/metrics.ts` — Metrics (latency, errors, throughput)
- `src/api-governance/telemetry/tracing.ts` — Distributed tracing
- `src/api-governance/telemetry/dashboards.ts` — Monitoring dashboards

## Notes

- Async collection with batched export keeps telemetry off the hot path
- Integrates with Prometheus/Grafana stacks
