<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Admin analytics — latency p50/p95/p99 trends, SSE live push, Chart.js widgets

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-analytics-observability
**Summary:** Add admin analytics latency percentile aggregation (p50/p95/p99), SSE live push endpoint, and Chart.js trend widgets on top of the existing analytics surface.
**Context:** gap-audit 2026-09-19 of `epic-analytics-observability` (E10) found no percentile aggregation on `src/routes/telemetry.ts`, no SSE live push, and no latency trend charts on the admin analytics dashboard.
**Acceptance Criteria:** `/api/telemetry/analytics/latency` returns p50/p95/p99 server-source only admin-gated; `/api/telemetry/stream` is `text/event-stream` with heartbeat; Chart.js latency/error/live-feed widgets render; tests cover fixture + non-admin rejection.

## Summary

## What

Admin analytics dashboard is missing latency percentile aggregation, Server-Sent Events live push, and Chart.js visualization widgets. The admin-only analytics baseline (summary, models, errors, daily) lives in `src/routes/telemetry.ts`, but does not surface latency distributions or any live updates.

Gap-audit finding: **E10** (2026-09-19) — 'Admin analytics: latency p50/p95/p99 trends, SSE live push, Chart.js widgets'.

## Why

The audit under `.plan/epics/epic-analytics-observability.md` (Docs-Gap Audit Remainders, E10) identifies three capability gaps in the admin analytics surface:

1. **No percentile aggregation.** Existing endpoints at `src/routes/telemetry.ts:77` (summary), `:105` (models), `:136` (errors), `:171` (daily) return counts only — no latency p50/p95/p99 is computed or returned.
2. **No SSE live push.** All current analytics endpoints are pull-only GETs. There is no `/api/telemetry/stream` or equivalent SSE handler to push new telemetry events to a connected admin dashboard in near real time.
3. **No Chart.js widgets.** The frontend admin analytics view has no latency-trend chart, error-rate chart, or live event feed. The Epic acceptance criterion 'Per-chat cost + quality dashboard functional' (FEA-2026-056, shipped) is satisfied for cost, but latency trend visualization is a separate audit line item.

Admin summary at `src/routes/telemetry.ts:77-104` is admin-only (gated by `can(ctx.userRole, 'admin.system')`); the new percentile and SSE endpoints MUST match that authorization gate.

## Scope

**In scope (extend):**
- `src/routes/telemetry.ts` — add `/api/telemetry/analytics/latency` (p50/p95/p99 per route or per event_type, server source only) and `/api/telemetry/stream` (SSE endpoint emitting new telemetry events). Keep admin authorization gate consistent with existing analytics handlers.
- `src/telemetry/service.ts` or a new `src/telemetry/percentiles.ts` — add percentile aggregation (server-side over a configurable time window; default last 1 hour). SQLite has no native percentile function — use ordered scan with row offset or compute over an in-memory sample bounded by the existing cap.
- New frontend files under `src/components/admin/analytics/` — Chart.js latency trend widget (p50/p95/p99 lines), error-rate bar chart, and a live event feed wired to the SSE endpoint.
- SSE wiring on the server: heartbeat + backpressure-aware client registry (one Elysia route returning `text/event-stream` with proper headers).

**Out of scope:**
- Any privacy change to the existing error projection (BUG-telemetry-errors-leaks-raw-event-data). The new endpoints MUST honor `source = 'server'` only.
- Frontend chat-side analytics (already covered by FEA-2026-056 / FEA-2026-057).
- Alerting/webhook pipeline (separate ticket E11).
- Engagement metrics (separate ticket E13).

## Acceptance Criteria

- `GET /api/telemetry/analytics/latency` returns p50, p95, and p99 in milliseconds for the requested time window, grouped by route or event_type, admin-only, server source only.
- `GET /api/telemetry/stream` returns `text/event-stream`, streams newly recorded telemetry events to authorized admin clients, and includes a periodic heartbeat comment to keep proxies from idling the connection out.
- Chart.js latency widget renders p50/p95/p99 trend lines; error-rate bar chart renders aggregated counts; live feed consumes SSE events without polling.
- E2E or integration test covers: latency endpoint returns percentiles for a seeded fixture; SSE emits at least one event after `record()` is called; non-admin requests are rejected (401/403).
- Docs: `.plan/epics/epic-analytics-observability.md` Docs-Gap Audit Remainders section updated to check off E10.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
