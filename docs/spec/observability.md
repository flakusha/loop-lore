<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Observability, Telemetry & Analytics Specification

> Promoted 2026-09-18 — merged from `observability-telemetry.md` + `analytics-observability.md` stubs.
> Authoritative source is `src/` and AGENTS.md.

## Overview

Unified observability surface covering runtime telemetry, structured analytics, log forwarding, and audit trails. Implementation in `src/telemetry/` (service) and `src/logger/` (structured logging).

## Scope

- **Telemetry service:** `src/telemetry/service.ts` collects events to `telemetry_events` table (migration 016).
- **Structured logging:** `src/logger/` provides structured JSONL output with transports (file, console, database).
- **Audit:** `src/admin/audit.ts` tracks privileged operations.
- **Metrics:** Prometheus-style metrics endpoint opt-in (planned, see `.plan/epics/epic-prometheus-metrics.md`).

## Technical Design

- **Telemetry service:** `src/telemetry/service.ts` exposes `record()`, `query()`, `aggregate()`. Events persisted to DB.
- **Logger:** `src/logger/queue.ts` async queue, `src/logger/transports/` multi-target, `src/logger/censors/` PII redaction.
- **OpenTelemetry:** planned via plugin (no OTEL SDK bundled).
- **Audit logging:** admin actions logged via `src/admin/audit.ts` middleware.

## Integration Points

- `src/telemetry/service.ts` — telemetry collector
- `src/logger/` — structured logging
- `src/admin/audit.ts` — privileged op audit
- `src/middleware/` — request logging
- `src/db/migrations/parts/016_telemetry_events.ts` — telemetry schema

## Related Epics

- `.plan/epics/epic-observability-telemetry.md`
- `.plan/epics/epic-analytics-observability.md`
- `.plan/epics/epic-logging.md`
- `.plan/epics/epic-performance-dashboard-slo.md`

## Provenance

This document was merged 2026-09-18 from:
- `docs/spec/observability-telemetry.md` (stub, 753B)
- `docs/spec/analytics-observability.md` (stub, 753B)

The original stubs referenced `.plan/epics/epic-observability-telemetry.md` and `.plan/epics/epic-analytics-observability.md` respectively; both source files were deleted after this merge.
