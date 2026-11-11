<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-telemetry-metrics-health-signal-usage-ledger-endpoint

**Status:** Done
**Scope:** `GET /api/v1/harness/metrics`, `GET /api/v1/harness/ledger`, `GET /api/v1/harness/stream` — all admin-gated (`requirePermission("admin.system")`), 503 when the runtime is not composed (the inert sibling posture). Landed 2026-11-11 on branch `harness-telemetry`.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Give the harness a metrics/health/telemetry signal: exec-log (`exec-log.ts`, recorder/query/stats, `GET /stats`), ledger (`usage-ledger.ts:48-124`, in-memory only, no route), and the `turn_id` correlation are all shipped, but nothing reaches the standard signals — no `harness` type under `src/telemetry`, no `src/routes/metrics.ts` or `src/routes/health.ts` mention, no usage-ledger endpoint, no SSE route. `TASK-harness-stats-dashboard` (Not Started, epic-harness-integration) covers `record()`-path event types + per-model rollups + Analytics sub-block; `TASK-harness-surfacing-exec-log-sse-to-chat-usage-ledger-credit-g` (Not Started) covers SSE-to-chat + credit guard. This ticket is the narrow ACP-side signal: per-profile run/error/latency counters visible to metrics/health.

**Context:**

## Why

Parity matrix gap #7 (PARTIAL) + `TASK-harness-stats-endpoint` precedent (Done ticket whose `GET /stats` route shipped but was never called — a signal nobody reads is not a signal). Operators scaling harness profiles have no in-band way to see failures, breaker trips, or spend; the JSONL requires shell access.

## Scope

- Harness counters (runs, errors by kind, breaker trips, ledger spend) surfaced through the existing telemetry/metrics path — reuse `record()`/collector/health conventions, no new tables, no new infra (same constraint as the stats-dashboard ticket).
- Read path for the in-memory usage ledger (or a decision recorded here that the JSONL + `GET /stats` already covers it).
- Cross-link, do not absorb: `TASK-harness-stats-dashboard` (event types + rollups + Analytics UI) and the SSE surfacing ticket (chat/SSE delivery + credit guard).

## Do NOT touch

- Do NOT duplicate the stats-dashboard event types or the Analytics sub-block.
- Do NOT build chat/SSE delivery (surfacing ticket owns it).

**Acceptance Criteria:**

- [x] Harness run/error/breaker/spend counters visible via the standard metrics or health surface (no shell/JSONL required). — the admin `GET /api/v1/harness/metrics` (`src/routes/harness/metrics.ts`) renders the SHARED harness block (`src/routes/harness/prometheus.ts`: runs/errors/spend, errors by kind, breaker open/trips, per-profile rpm/tokens/breaker — byte-identical to the opt-in `/metrics` families, so the two surfaces cannot drift) PLUS scoped families: `loop_lore_harness_dispatch_total{task_type}` and `loop_lore_harness_profile_dispatch_total{profile}` (process-lifetime exec-log counters extended in place with `byTaskType`/`byProfile`), `loop_lore_harness_profile_quota_reset_epoch_seconds`, `loop_lore_harness_profile_info{profile,flavor}`, and `loop_lore_harness_profile_available` (cached binary probe). Health folds into the metrics families (adapter liveness + breaker gauges) — no second JSON health route; `/api/health` stays provider-agnostic.
- [x] Usage ledger is queryable or an explicit already-covered decision is recorded with pointers. — `GET /api/v1/harness/ledger` (`src/routes/harness/ledger.ts`) returns the RAW ledger snapshot: every profile the ledger has seen, insertion order, with the `quotaResetAt` surface. `/harness/usage` remains the breaker-merged view over the same rows (`usage-view.ts`).
- [x] No new tables, no new infra; existing `record()`/collector conventions reused. — exec-log counters extended in place; the SSE surface rides the existing `routes/sse-stream.ts` scaffold (ActivityStreamer poll+change shape); zero migrations, zero new deps.
