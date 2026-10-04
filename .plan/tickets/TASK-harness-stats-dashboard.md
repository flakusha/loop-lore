<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness stats dashboard (events + rollups + tab)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Harness telemetry as new `telemetry_events` types (no new tables) + per-model rollups + one Analytics sub-block; export ResourceManager.inFlight into MetricsCollector.
**Context:** Three wired layers: `telemetry/service.ts` + `telemetry_events` table (6-type ingest union — no `tool.*` event despite the header comment), `api-governance/telemetry/collector.ts` (500-sample ring) → `GET /api/v1/metrics` vs process-only `GET /metrics`, AUX telemetry route; dashboard `admin.html` Analytics/Health tabs + Alpine loaders. Gaps: inFlight in-memory only, models endpoint groups by event_type (no per-model tokens/latency), no gripe event type.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] New `TelemetryEventBody` union members via existing `record()` path: `harness.call_completed{model,tokensIn,tokensOut,latencyMs,savedTokens}`, `gripe{submittedBy,category,text}`; retention/cleanup untouched; `categoriseError()` aggregates in the errors endpoint.
- [ ] `ResourceManager.inFlight` (`llm/resource-manager.ts:66`) pushed into `MetricsCollector` snapshot → visible in `/metrics` + Health tab.
- [ ] `analytics/models` rolls up per-model tokens/latency/error (not event_type); one new Analytics sub-block in `admin.html` reusing `loadAnalytics()` (per-model table + gain totals + gripes list); user page reuses `routes/analytics.ts`.
- [ ] No new tables, no new infra; RTK/lean-ctx gain-dashboard shape (before/after per call + aggregate) matched with the savedTokens field.

## Related Files

- `src/telemetry/service.ts`, `validation/schemas/telemetry.ts`, `src/db/schema-telemetry.ts`, `src/api-governance/telemetry/`
- `src/routes/telemetry.ts`, `analytics.ts`, `admin/aux-telemetry.ts`, `admin/provider-health.ts`, `src/views/admin.html`, `frontend/alpine/admin*.ts`
- `src/llm/resource-manager.ts`, `src/nsfw/telemetry-id-hashes.ts`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 9349634
