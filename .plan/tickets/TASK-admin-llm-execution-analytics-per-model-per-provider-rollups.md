<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin LLM execution analytics — per-model/per-provider tokens, latency, cost rollups

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-analytics-observability
**Summary:** Add one admin-only rollup endpoint over `telemetry_events` grouped by model x provider, so admins get fleet-wide LLM spend/latency/error analysis.
**Context:** Found 2026-09-27 during LLM execution-stats analysis. Per-user analytics exist; the admin fleet-wide cut does not. Builds on the latency and cost tickets; blocked by neither.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** BUG-generation-completed-latencyms-hardcoded-to-0-on-two-emit-pa, TASK-per-model-per-provider-cost-attribution-for-llm-execution-st, FEAT-admin-analytics-latency-p50-p95-p99-trends-sse-live-push-cha, src/routes/telemetry.ts, src/routes/analytics.ts, src/routes/admin/aux-telemetry.ts

## Summary

Admins have per-user conversation analytics (`GET /api/analytics/overview` — user-scoped) and AUX-pipeline rollups (`GET /api/admin/telemetry/aux` — aux calls only), but no fleet-wide view of primary LLM execution: tokens, latency, errors, and cost grouped by model x provider across all users. `GET /api/telemetry/analytics/models` (telemetry.ts:105-135) groups by `event_type` only — it answers "how many completions" but not "which model burned what". This ticket adds the missing rollup; E10 percentiles and Chart.js widgets consume it later.

## What

- Existing cuts: `telemetry.ts:77` summary (total count), `:105` models (count by event_type), `:136` errors (grouped counts), `:171` daily (counts by day) — all counts, no token/latency/cost dimensions.
- Data available: `generation.completed` carries prompt/completion/totalTokens + latencyMs + model + provider (post-store.ts:147, non-stream.ts:170, stream-to-client.ts:233); `aux.call` carries the same via aux-telemetry.ts.
- Pattern to copy: `src/routes/admin/aux-telemetry.ts` — server-source-only, HMAC PII posture, `MAX_LIMIT` cap, `since` window clamp, `aggregate_only` mode, `admin.system` gate.
- Frontend: `src/frontend/alpine/admin-system.ts` analytics tab already renders summary/daily/errors/conversation-overview — new widget plugs into the same tab, no new page.

## Why

"Which model costs us most / fails most / is slowest" is the first question every admin asks and no endpoint answers. One rollup endpoint unblocks the E10 chart widgets and the cost-governance UI without touching the event pipeline.

## Scope

- New `GET /api/telemetry/analytics/llm-usage` (naming per implementer): `source = 'server'`, `admin.system` gate, `since` window (default 24h, max 7d, same clamps as aux-telemetry), grouped by `(model, provider)` with `totalCalls`, `successCount`, `failureCount`, `totalPromptTokens`, `totalCompletionTokens`, `avgLatencyMs`, `costEstimate` (flat rate until the pricing ticket lands — mark `estimated: true`).
- `aggregate_only`-style default: rollup rows only, no per-event PII; follow aux-telemetry.ts redaction posture (no `event_data`/`user_id`/`chat_id` on the wire).
- Admin-system.ts widget: one table/cards block rendering the rollup (no Chart.js — E10 owns charts).
- Tests: seeded fixture asserts per-model grouping, window clamp, non-admin rejection, no PII on the wire.
- Out of scope: percentiles (E10), SSE live push (E10), alerting (E11), pricing table (sibling TASK), latency source fix (sibling BUG — rollup reads whatever is stored).

## Acceptance Criteria

- [ ] `GET /api/telemetry/analytics/llm-usage` returns per-model x provider rollups, admin-only, server-source-only
- [ ] Window clamps + response cap match aux-telemetry posture; no PII on the wire
- [ ] Admin analytics tab renders the rollup without polling regressions
- [ ] Non-admin requests rejected (401/403); `bun test src/routes/telemetry.test.ts` green
