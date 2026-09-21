<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Observability, Telemetry & Analytics

Status: Partially implemented — telemetry service, structured logging, and admin analytics shipped; metrics endpoint, OTEL, and privileged-admin audit not built.

## Implemented

- Telemetry — `src/telemetry/` (service / cleanup / config): events recorded into `telemetry_events` (table created in `src/db/migrations/001_init.ts`; the previously cited `parts/016_telemetry_events.ts` path does not exist). Emitters: generation lifecycle (`generation.completed|failed|truncated` in `src/generation/`), aux-pipeline calls.
- Structured logging — `src/logger/`: async queue (`queue.ts`), multi-target transports (`src/logger/transports/`), PII redaction (`censors/`), formatters, levels, limits.
- Admin analytics — `src/routes/analytics.ts` + `src/routes/admin/aux-telemetry.ts` query `telemetry_events` for generation/aux stats.

## Not implemented / aspirational

- Prometheus `/metrics` exposition — no dedicated epic (`epic-prometheus-metrics.md` does not exist); tracked as a task in `.plan/epics/epic-performance-dashboard-slo.md`.
- OpenTelemetry — planned via plugin; no OTEL SDK bundled.
- Privileged-operation audit — the old citation `src/admin/audit.ts` does NOT exist; audit surfaces today are memory audit (`src/memory/audit.ts` → `memory_audit_log`) and NSFW moderation audit (`src/nsfw/moderation-service/audit.ts` → `moderation_actions`).
- Observability dashboard — see `.plan/epics/epic-performance-dashboard-slo.md` (Not Started).

## Epics

- `.plan/epics/epic-observability-telemetry.md` · `.plan/epics/epic-analytics-observability.md` · `.plan/epics/epic-logging.md` · `.plan/epics/epic-api-telemetry.md` · `.plan/epics/epic-performance-dashboard-slo.md`

Provenance: merged 2026-09-18 from the `docs/spec/observability-telemetry.md` + `analytics-observability.md` doc stubs (those doc files were deleted; the epics above remain).
