<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Prometheus metrics endpoint (opt-in)

**Status:** ✅ Implemented
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-telemetry.md
**Related:** TASK-observability-config-section, FEAT-liveness-readiness-endpoints-opt-in-config

## Summary

Expose a Prometheus text-format `/metrics` endpoint (opt-in by config) that scrapes
core server and process metrics, independent of the aspirational
`epic-api-telemetry.md` collector that is not yet implemented.

## Context

`epic-api-telemetry.md` and `epic-api-governance.md` name a `/api/metrics` endpoint
and a `MetricsCollector`, but no collector or metrics route exists in `src/`. There
is no `prometheus` hit anywhere in `src/`. Operators have no scrapeable surface.

## Direction

1. Minimal in-process metric registry (counter/gauge/histogram) under
   `src/telemetry/` — no external dependency for the core types.
2. Expose process + server metrics: uptime, request count/latency (from existing
   middleware if present), active WS connections, memory (RSS/heap), and the
   provider-health summary counts from `src/admin/provider-health.ts`.
3. `GET /metrics` renders Prometheus text exposition format; gated by the same
   observability opt-in config section, unmounted by default.
4. Do NOT block on distributed tracing or a dashboard — this ticket is the
   scrape surface only.

## Acceptance Criteria

- [ ] `/metrics` returns valid Prometheus text format when enabled.
- [ ] Includes at least: uptime, process memory, request count, active connections.
- [ ] Endpoint unmounted by default; mounted only when config opts in.
- [ ] No scrape leaks auth/chat/user identifiers into labels.
- [ ] Tests assert format + metric presence + disabled-by-default.
- [ ] `bun run check` green.
